// Menu do robô no Telegram, respondido NA HORA pela VPS (o robô no GitHub só lê o Telegram a cada rodada, de 30 em 30 minutos).
//
// Divisão de trabalho (para nunca haver duas respostas à mesma coisa):
//  - VPS (este arquivo): responde na hora o que só navega (menu, lista de temas, status, ajuda, "criar tema") e, quando você pede uma
//    MUDANÇA (ligar/desligar/criar/apagar tema), responde "⏳ Recebi" na hora.
//  - Robô (src/comandos.ts): aplica as mudanças na próxima rodada e confirma no mesmo chat. Com TELEGRAM_MENU_NA_VPS=1 no ajustes.env,
//    o robô deixa a navegação para a VPS.
// A VPS só LÊ o Telegram sem confirmar as mensagens (getUpdates sem offset): quem confirma, e por isso quem aplica, é o robô.
// Segurança: só o chat privado do dono (config.json → telegram.chat) é obedecido. Qualquer erro é engolido: o enviador do WhatsApp
// nunca é afetado.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const botao = (text, data) => ({ text, callback_data: data });
const VOLTAR = botao('⬅️ Menu', 'menu');
const EMOJI = { vestidos: '👗', tecnologia: '📱', cozinha: '🍳', games: '🎮' };
const TEMAS_PADRAO = [
  { chave: 'vestidos', nome: 'Dia dos vestidos, blusinhas e calças femininas' },
  { chave: 'tecnologia', nome: 'Dia da tecnologia' },
  { chave: 'cozinha', nome: 'Dia da casa e cozinha' },
  { chave: 'games', nome: 'Dia dos games' },
];

/** Os comandos do menu azul do Telegram. */
export const COMANDOS_DO_MENU = [
  { command: 'menu', description: 'Abrir o menu com botões' },
  { command: 'temas', description: 'Ver os temas' },
  { command: 'status', description: 'Como o robô está' },
  { command: 'ajuda', description: 'Lista de comandos' },
];

export function menuPrincipal() {
  return {
    texto: '🤖 Robô Mata Preço\nO que você quer fazer?',
    teclado: [[botao('📅 Tema do dia', 'temas'), botao('📊 Status', 'status')], [botao('🛑 Desligar tema', 'desligar'), botao('✍️ Criar tema', 'criar')], [botao('❓ Ajuda', 'ajuda')]],
  };
}

const AJUDA = ['Comandos do robô:', '/menu — abre o menu com botões', '/temas — lista os temas', '/tema vestidos — liga o tema HOJE', '/tema vestidos sexta — liga TODA sexta', '/tema desligar — desliga o tema', '/novotema calcas calça, jeans, legging — cria um tema', '/apagartema calcas — apaga um tema criado', '/status — como o robô está', '', 'O menu responde na hora; mudanças de tema valem na rodada seguinte do robô (até 30 min).'].join('\n');

/** O estado que o robô publica no site (comandos.json): temas disponíveis e o tema de hoje. Sem ele, vale a lista de fábrica. */
export function estadoOuPadrao(estado) {
  const temas = Array.isArray(estado?.temas) && estado.temas.length ? estado.temas.filter((t) => t && typeof t.chave === 'string') : TEMAS_PADRAO;
  return { temas, temaAtivo: typeof estado?.temaAtivo === 'string' ? estado.temaAtivo : undefined, atualizadoEm: estado?.atualizadoEm };
}

const minutosAtras = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60_000)) : undefined;
};

/** Resposta de quem só navega (nada é mudado). Devolve undefined se o dado não é de navegação. */
export function respostaDeNavegacao(dado, estadoBruto) {
  const estado = estadoOuPadrao(estadoBruto);
  const [acao = '', a = ''] = String(dado).split(':');
  if (acao === 'menu') return menuPrincipal();
  if (acao === 'ajuda') return { texto: AJUDA, teclado: [[VOLTAR]] };
  if (acao === 'criar') {
    return { texto: '✍️ Para criar um tema, escreva no chat:\n\n/novotema NOME palavra1, palavra2, palavra3\n\nExemplo:\n/novotema calcas calça, jeans, legging\n\nDepois ele aparece aqui em "Tema do dia".', teclado: [[VOLTAR]] };
  }
  if (acao === 'status') {
    const idade = minutosAtras(estado.atualizadoEm);
    return { texto: [`Tema de hoje: ${estado.temaAtivo ?? 'nenhum'}`, idade === undefined ? 'Estado do robô: ainda sem leitura.' : `Estado lido do robô (há ${idade} min).`].join('\n'), teclado: [[VOLTAR]] };
  }
  if (acao === 'temas') {
    return { texto: '📅 Qual tema?', teclado: [...estado.temas.map((t) => [botao(`${EMOJI[t.chave] ?? '🏷️'} ${t.chave}`, `t:${t.chave}`)]), [VOLTAR]] };
  }
  if (acao === 't' && a) {
    const nome = estado.temas.find((t) => t.chave === a)?.nome ?? a;
    return { texto: `${nome}\nQuando?`, teclado: [[botao('Só hoje', `h:${a}`), botao('Toda sexta', `d:${a}:sexta`)], [botao('Todo sábado', `d:${a}:sabado`), botao('Todo domingo', `d:${a}:domingo`)], [botao('⬅️ Temas', 'temas')]] };
  }
  return undefined;
}

/** Toque que MUDA algo (o robô aplica na próxima rodada): a VPS só confirma o recebimento. */
export function ehToqueQueMuda(dado) {
  const acao = String(dado).split(':')[0];
  return acao === 'h' || acao === 'd' || acao === 'desligar';
}

export function respostaDeRecebido(dado) {
  const [acao, a = '', b = ''] = String(dado).split(':');
  const o = acao === 'desligar' ? 'desligar o tema' : acao === 'h' ? `ligar o tema ${a} hoje` : `ligar o tema ${a} toda ${b}`;
  return { texto: `⏳ Recebi: ${o}.\nO robô aplica na próxima rodada (até 30 min) e confirma aqui.`, teclado: [[VOLTAR]] };
}

/** Comando de texto: navegação (responde na hora), mudança (confirma o recebimento) ou outro (deixa para o robô). */
export function respostaDeTexto(texto, estadoBruto) {
  const comando = String(texto).trim().split(/\s+/)[0].replace(/@\S+$/, '').toLowerCase();
  if (comando === '/menu' || comando === '/start') return { tipo: 'navega', ...menuPrincipal() };
  if (comando === '/ajuda') return { tipo: 'navega', texto: AJUDA, teclado: [[VOLTAR]] };
  if (comando === '/status') return { tipo: 'navega', ...respostaDeNavegacao('status', estadoBruto) };
  if (comando === '/temas') {
    const estado = estadoOuPadrao(estadoBruto);
    return { tipo: 'navega', texto: ['Temas:', ...estado.temas.map((t) => `• ${t.chave} — ${t.nome}`), '', 'Ligar: /tema NOME   ou   /tema NOME sexta', 'Criar: /novotema NOME palavra1, palavra2, palavra3'].join('\n'), teclado: [[VOLTAR]] };
  }
  if (comando === '/tema' || comando === '/novotema' || comando === '/apagartema') {
    return { tipo: 'muda', texto: '⏳ Recebi o comando.\nO robô aplica na próxima rodada (até 30 min) e confirma aqui.', teclado: [[VOLTAR]] };
  }
  return undefined;
}

/**
 * Liga o menu: de poucos em poucos segundos, lê o Telegram (sem confirmar) e responde o que é do dono. `vistosPath` guarda o último
 * update já respondido (para não responder duas vezes, mesmo depois de reiniciar). Nunca lança erro.
 */
export function iniciar({ token, chat, urlDoSite, vistosPath, log, fetchFn = fetch, intervaloMs = 4000 }) {
  if (!token || !/^-?\d{5,}$/.test(String(chat))) return () => undefined;
  const dono = String(chat);
  const base = `https://api.telegram.org/bot${token}`;
  let ultimo = 0;
  try {
    if (existsSync(vistosPath)) ultimo = Number(JSON.parse(readFileSync(vistosPath, 'utf8')).ultimo) || 0;
  } catch {
    ultimo = 0;
  }
  const chamar = (metodo, corpo) => fetchFn(`${base}/${metodo}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  let estado;
  let estadoEm = 0;
  const lerEstado = async () => {
    if (Date.now() - estadoEm < 60_000) return estado;
    estadoEm = Date.now();
    try {
      const r = await fetchFn(`${String(urlDoSite).replace(/\/+$/, '')}/comandos.json?t=${Date.now()}`, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) estado = await r.json();
    } catch {
      // sem o arquivo, vale a lista de fábrica
    }
    return estado;
  };
  let ocupado = false;
  let ultimoErroEm = 0;
  const rodada = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const r = await fetchFn(`${base}/getUpdates?timeout=0&limit=50&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`, { signal: AbortSignal.timeout(15_000) });
      const dados = await r.json().catch(() => ({}));
      for (const u of (dados.ok ? dados.result ?? [] : []).sort((a, b) => a.update_id - b.update_id)) {
        if (u.update_id <= ultimo) continue;
        ultimo = u.update_id;
        writeFileSync(vistosPath, JSON.stringify({ ultimo }));
        const cb = u.callback_query;
        if (cb) {
          const doDono = cb.message?.chat?.type === 'private' && String(cb.message.chat.id) === dono && String(cb.from?.id) === dono;
          if (!doDono || !cb.data) continue;
          await chamar('answerCallbackQuery', { callback_query_id: cb.id });
          const res = ehToqueQueMuda(cb.data) ? respostaDeRecebido(cb.data) : respostaDeNavegacao(cb.data, await lerEstado());
          if (!res) continue;
          const editou = await chamar('editMessageText', { chat_id: dono, message_id: cb.message.message_id, text: res.texto, reply_markup: { inline_keyboard: res.teclado } });
          const ok = editou ? (await editou.json().catch(() => ({}))).ok : false;
          if (!ok) await chamar('sendMessage', { chat_id: dono, text: res.texto, reply_markup: { inline_keyboard: res.teclado } });
          continue;
        }
        const m = u.message;
        if (!m?.text || m.chat?.type !== 'private' || String(m.chat.id) !== dono || !m.text.startsWith('/')) continue;
        const res = respostaDeTexto(m.text, await lerEstado());
        if (res) await chamar('sendMessage', { chat_id: dono, text: res.texto, reply_markup: { inline_keyboard: res.teclado } });
      }
    } catch (e) {
      if (Date.now() - ultimoErroEm > 10 * 60_000) {
        ultimoErroEm = Date.now();
        log?.(`Menu do Telegram: erro passageiro (${String(e?.message ?? e).slice(0, 80)}). Sigo tentando.`);
      }
    } finally {
      ocupado = false;
    }
  };
  chamar('setMyCommands', { commands: COMANDOS_DO_MENU });
  const timer = setInterval(rodada, intervaloMs);
  timer.unref?.();
  log?.('Menu do Telegram ligado: responde na hora (só ao seu chat).');
  return () => clearInterval(timer);
}
