// Regras do enviador, sem nada de rede: dá para testar sem WhatsApp.

const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });

export function horaEmBrasilia(data) {
  return Number(fmtHora.format(data));
}

/**
 * Mensagens que ainda não foram enviadas e ainda valem (preço velho não é postado). Por padrão da mais antiga para a mais nova;
 * com `maisNovaPrimeiro`, a oferta mais fresca sai primeiro (se a fila acumulou, o que chega agora não espera atrás das velhas, que vencem sozinhas).
 */
export function selecionarPendentes(mensagens, enviados, agora, idadeMaximaMs, maisNovaPrimeiro = false) {
  const lista = mensagens.filter((m) => m && m.id && m.texto && !(m.id in enviados)).filter((m) => agora - m.criadoEm <= idadeMaximaMs);
  return lista.sort((a, b) => (maisNovaPrimeiro ? b.criadoEm - a.criadoEm : a.criadoEm - b.criadoEm));
}

/** O ritmo do enviador: o que o robô publicou em `envio` (whatsapp.json) vale mais que o config.json da VPS, que só cobre o que faltar. */
export function ritmoDoEnvio(config = {}, remoto = {}) {
  const numero = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : padrao);
  const e = remoto && typeof remoto === 'object' ? remoto : {};
  const esperaMinSeg = numero(e.esperaMinSeg, numero(config.esperaMinSeg, 90));
  return {
    maximoPorHora: numero(e.maximoPorHora, numero(config.maximoPorHora, 6)),
    esperaMinSeg,
    esperaMaxSeg: Math.max(esperaMinSeg, numero(e.esperaMaxSeg, numero(config.esperaMaxSeg, 240))),
    idadeMaximaMin: numero(e.idadeMaximaMin, numero(config.idadeMaximaMin, 180)),
    maisNovaPrimeiro: typeof e.maisNovaPrimeiro === 'boolean' ? e.maisNovaPrimeiro : config.maisNovaPrimeiro === true,
    horaInicio: Number.isFinite(Number(e.horaInicio)) && e.horaInicio !== null ? Number(e.horaInicio) : (config.horaInicio ?? 8),
    horaFim: Number.isFinite(Number(e.horaFim)) && e.horaFim !== null ? Number(e.horaFim) : (config.horaFim ?? 22),
  };
}

/** Diz se pode enviar agora: dentro do horário e abaixo do limite por hora. */
export function podeEnviarAgora({ agora, envios, maximoPorHora, horaInicio, horaFim }) {
  const hora = horaEmBrasilia(new Date(agora));
  if (hora < horaInicio || hora >= horaFim) return { pode: false, motivo: `fora do horário (${horaInicio}h às ${horaFim}h)` };
  const naUltimaHora = envios.filter((t) => agora - t < 3_600_000).length;
  if (naUltimaHora >= maximoPorHora) return { pode: false, motivo: `limite de ${maximoPorHora} por hora atingido` };
  return { pode: true };
}

/** Espera aleatória entre mínimo e máximo, para o envio não ter ritmo de robô. */
export function esperaAleatoria(minMs, maxMs, sorteio = Math.random) {
  return Math.round(minMs + sorteio() * Math.max(0, maxMs - minMs));
}

/** Apaga do histórico o que é velho demais para importar. */
export function podarEstado(estado, agora, diasMantidos = 3) {
  const limite = agora - diasMantidos * 86_400_000;
  const enviados = Object.fromEntries(Object.entries(estado.enviados ?? {}).filter(([, t]) => t >= limite));
  const envios = (estado.envios ?? []).filter((t) => t >= limite);
  return { enviados, envios };
}

/** Aceita o link de um canal (https://whatsapp.com/channel/CODIGO) e devolve o código; ou null. */
export function codigoDoCanal(texto) {
  const m = /whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/.exec(String(texto ?? ''));
  return m ? m[1] : null;
}

/** Normaliza o destino: JID pronto (…@g.us / …@newsletter) ou link de canal. */
export function tipoDeDestino(destino) {
  const v = String(destino ?? '').trim();
  if (v.endsWith('@g.us')) return { tipo: 'grupo', jid: v };
  if (v.endsWith('@newsletter')) return { tipo: 'canal', jid: v };
  const codigo = codigoDoCanal(v);
  if (codigo) return { tipo: 'canal-por-link', codigo };
  const convite = /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/.exec(v)?.[1];
  if (convite) return { tipo: 'grupo-por-link', codigo: convite };
  return { tipo: 'invalido' };
}

/**
 * O destino recebe esta mensagem? Destino de nicho (com `nichos`) recebe só os nichos dele. Destino geral recebe o que o
 * filtro do geral aceita (`geral.nichos` vazio = todos, menos `geral.sem`). Mensagem sem categoria conta como "geral".
 */
export function destinoAceita(destino, categoria, geral = {}) {
  const c = categoria || 'geral';
  if (Array.isArray(destino?.nichos) && destino.nichos.length) return destino.nichos.includes(c);
  if ((geral.sem ?? []).includes(c)) return false;
  return !(geral.nichos ?? []).length || geral.nichos.includes(c);
}

/**
 * Endereços para tentar a foto do produto, o melhor primeiro. A foto do Mercado Livre vem em WebP; o mesmo servidor
 * entrega a versão JPEG trocando a extensão, o que dispensa o conversor (sharp).
 */
export function enderecosDaFoto(url) {
  if (!url) return [];
  const jpg = /mlstatic\.com\/.+\.webp(\?|$)/i.test(url) ? url.replace(/\.webp(\?|$)/i, '.jpg$1') : undefined;
  return jpg ? [jpg, url] : [url];
}

/**
 * O texto da mensagem para um destino. O convite traz `textos` ({ canal, grupo }): o canal convida para o outro canal e o grupo convida
 * para os dois. Mensagem sem `textos` (ofertas, ou convite de um robô antigo) usa `texto`.
 */
export function textoParaDestino(m, jid) {
  if (m?.textos) {
    const t = String(jid ?? '').endsWith('@g.us') ? m.textos.grupo : m.textos.canal;
    if (t) return t;
  }
  return m.texto;
}
