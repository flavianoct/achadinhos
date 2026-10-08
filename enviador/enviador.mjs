// Enviador de WhatsApp do robô de achadinhos.
// Lê https://SEU-SITE/whatsapp.json (a fila que o robô publica) e posta nos seus grupos e canal.
// Uso: node enviador.mjs            (fica rodando e enviando)
//      node enviador.mjs listar     (mostra seus grupos e os códigos deles)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { destinoAceita, enderecosDaFoto, esperaAleatoria, podarEstado, podeEnviarAgora, selecionarPendentes, tipoDeDestino } from './logica.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG = join(aqui, 'config.json');
// O login do WhatsApp fica na sua pasta de usuário, fora do projeto: assim ele nunca vai parar no GitHub por engano.
const PASTA_DE_DADOS = join(homedir(), '.achadinhos-enviador');
mkdirSync(PASTA_DE_DADOS, { recursive: true });
const CAMINHO_ESTADO = join(PASTA_DE_DADOS, 'estado.json');
const PASTA_LOGIN = join(PASTA_DE_DADOS, 'login-whatsapp');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] ${m}`);

function lerConfig() {
  if (!existsSync(CAMINHO_CONFIG)) {
    writeFileSync(
      CAMINHO_CONFIG,
      JSON.stringify(
        {
          urlDoSite: 'https://flavianoct.github.io/achadinhos',
          destinos: [],
          maximoPorHora: 6,
          esperaMinSeg: 90,
          esperaMaxSeg: 240,
          idadeMaximaMin: 180,
          horaInicio: 8,
          horaFim: 22,
        },
        null,
        2,
      ),
    );
    log('Criei o arquivo config.json. Rode "listar" para ver seus grupos e preencha "destinos".');
  }
  return JSON.parse(readFileSync(CAMINHO_CONFIG, 'utf8'));
}

function lerEstado() {
  try {
    return { enviados: {}, envios: [], ...JSON.parse(readFileSync(CAMINHO_ESTADO, 'utf8')) };
  } catch {
    return { enviados: {}, envios: [] };
  }
}
const salvarEstado = (e) => writeFileSync(CAMINHO_ESTADO, JSON.stringify(e, null, 2));

/** Conecta ao WhatsApp. Na primeira vez mostra um QR code para escanear em Aparelhos conectados. */
async function conectar() {
  mkdirSync(PASTA_LOGIN, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_LOGIN);
  const { version } = await fetchLatestBaileysVersion();
  return new Promise((resolve, reject) => {
    const abrir = () => {
      const sock = makeWASocket({ version, auth: state, logger: pino({ level: process.env.LOG_NIVEL || 'silent' }), browser: Browsers.macOS('Desktop'), markOnlineOnConnect: false, generateHighQualityLinkPreview: false, syncFullHistory: false });
      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          log('Escaneie este QR no WhatsApp do número dedicado: Configurações → Aparelhos conectados → Conectar um aparelho.');
          qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
          log('WhatsApp conectado.');
          sockAtual.sock = sock;
          sockAtual.aberto = true;
          resolve(sock);
        }
        if (connection === 'close') {
          if (sockAtual.sock === sock) sockAtual.aberto = false;
          const codigo = lastDisconnect?.error?.output?.statusCode;
          if (codigo === DisconnectReason.loggedOut) {
            reject(new Error('O WhatsApp desconectou este aparelho. Apague a pasta .achadinhos-enviador (na sua pasta de usuário) e rode de novo para escanear o QR.'));
          } else {
            log(`Conexão caiu (código ${codigo ?? '?'}). Reconectando em 5 s…`);
            setTimeout(abrir, 5000);
          }
        }
      });
      sockAtual.sock = sock;
    };
    abrir();
  });
}
/** O socket que está valendo agora. Muda a cada reconexão, por isso o envio sempre lê daqui (e não guarda o primeiro). */
const sockAtual = { sock: null, aberto: false };

/** Derruba a conexão atual de propósito: o evento "close" dispara e a reconexão automática abre uma nova. */
function reiniciarConexao(motivo) {
  log(`Reiniciando a conexão com o WhatsApp (${motivo}).`);
  sockAtual.aberto = false;
  try {
    sockAtual.sock?.end?.(new Error(motivo));
  } catch {
    // se já estava morta, a reconexão já está em andamento
  }
}

/** Erros que indicam queda da conexão (a mensagem não foi o problema): não vale descartá-la. */
const ehQuedaDeConexao = (e) => /connection (closed|lost|failure)|timed out|socket|stream errored|not open/i.test(String(e?.message ?? e));

async function listar() {
  const sock = await conectar();
  const grupos = await sock.groupFetchAllParticipating();
  log('Seus grupos (copie o "código" do que quiser usar para config.json → destinos):');
  for (const g of Object.values(grupos)) console.log(`  ${g.subject}\n    código: ${g.id}`);
  if (!Object.keys(grupos).length) console.log('  (nenhum grupo encontrado)');
  console.log('\nCanal: cole o link do seu canal (https://whatsapp.com/channel/...) em "destinos" que eu descubro o código sozinho.');
  process.exit(0);
}

/**
 * Resolve os destinos em códigos (JID), guardando os nichos de cada um: { jid, nichos }. Links de canal viram o código do canal.
 * Destino sem nichos é geral (recebe o que o filtro do geral aceita).
 */
async function resolverDestinos(sock, config) {
  const prontos = [];
  for (const d of config.destinos ?? []) {
    const nichos = typeof d === 'string' ? undefined : d.nichos;
    const add = (jid) => {
      const ja = prontos.find((p) => p.jid === jid);
      // O mesmo grupo listado como geral e como de nicho fica geral (recebe mais, não menos).
      if (!ja) prontos.push({ jid, nichos });
      else if (!nichos || !ja.nichos) ja.nichos = undefined;
      else ja.nichos = [...new Set([...ja.nichos, ...nichos])];
    };
    const t = tipoDeDestino(typeof d === 'string' ? d : d.jid ?? d.link);
    if (t.tipo === 'grupo' || t.tipo === 'canal') add(t.jid);
    else if (t.tipo === 'canal-por-link') {
      try {
        const meta = await sock.newsletterMetadata('invite', t.codigo);
        add(meta.id);
        // A consulta pelo link não traz o papel da conta; pelo código do canal ela traz.
        let completo = meta;
        try {
          completo = await sock.newsletterMetadata('jid', meta.id);
        } catch {
          // fica com o que a consulta pelo link trouxe
        }
        const papel = completo.viewer_metadata?.role ?? meta.viewer_metadata?.role ?? 'não informado';
        log(`  dados do canal: campos da conta = ${Object.keys(completo.viewer_metadata ?? {}).join(',') || 'nenhum'}; estado = ${completo.state?.type ?? '?'}`);
        log(`Canal encontrado: ${meta.thread_metadata?.name?.text ?? meta.id} (papel desta conta: ${papel}; seguidores: ${meta.thread_metadata?.subscribers_count ?? '?'})`);
        if (papel !== 'OWNER' && papel !== 'ADMIN') log('  ATENÇÃO: esta conta não é dona nem administradora do canal. O WhatsApp aceita o envio e não publica. Escaneie o QR com a conta que criou o canal.');
      } catch (e) {
        log(`Não consegui abrir o canal pelo link (${e.message}). Confira o link e se a conta é dona do canal.`);
      }
    } else if (t.tipo === 'grupo-por-link') {
      try {
        const info = await sock.groupGetInviteInfo(t.codigo);
        // Só dá para postar em grupo do qual o número é membro: confere (e avisa o que fazer se não for).
        let membro = true;
        try {
          await sock.groupMetadata(info.id);
        } catch {
          membro = false;
        }
        log(`Grupo encontrado: ${info.subject ?? info.id} (${info.size ?? '?'} membros; este número ${membro ? 'é membro' : 'NÃO é membro'}).`);
        if (membro) add(info.id);
        else log('  ATENÇÃO: o número do enviador não está nesse grupo. Entre no grupo com ele (abra o link de convite no WhatsApp desse número) ou peça a um administrador para adicioná-lo. Enquanto isso, o grupo é pulado.');
      } catch (e) {
        log(`Não consegui abrir o grupo pelo link (${e.message}). Confira se o convite ainda vale.`);
      }
    } else log(`Destino ignorado (não entendi): ${JSON.stringify(d)}`);
  }
  return prontos;
}

/** Filtro do canal geral publicado pelo robô (GERAL_NICHOS e GERAL_SEM_NICHOS). */
let filtroGeral = {};

/**
 * Destinos publicados pelo robô em whatsapp.json (WHATSAPP_DESTINOS e WHATSAPP_ROTAS do ajustes.env) + os do config.json
 * local (gerais). Cada um: { link, nichos? }.
 */
async function destinosCompletos(config) {
  let remotos = [];
  try {
    const url = `${config.urlDoSite.replace(/\/+$/, '')}/whatsapp.json?t=${Date.now()}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    if (r.ok) {
      const dados = await r.json();
      remotos = (dados.destinos ?? []).filter((d) => d.link).map((d) => ({ link: d.link, nichos: d.nichos }));
      filtroGeral = dados.geral ?? {};
    }
  } catch {
    // sem o site agora: segue só com os destinos locais
  }
  const locais = (config.destinos ?? []).map((d) => (typeof d === 'string' ? d : d.jid ?? d.link)).filter(Boolean).map((link) => ({ link }));
  return [...locais, ...remotos];
}

/** Mostra o recibo que o WhatsApp devolveu (id e id do servidor): é a prova de que a mensagem foi aceita. */
function recibo(r, tipo) {
  log(`  ${tipo} aceito pelo WhatsApp (id ${r?.key?.id ?? '?'}, servidor ${r?.key?.server_id ?? r?.key?.serverId ?? 'sem id de servidor'}).`);
}

// Em canal, a mensagem com imagem do Mercado Livre (WebP) foi aceita pelo WhatsApp mas não apareceu para ninguém; o texto chega.
// Por padrão vai só texto (o link já leva à oferta). Para tentar imagem de novo, ponha "enviarImagem": true no config.json.
let enviarImagem = false;
let usarPrevia = true;
// Imagem enviada nos grupos: "foto" (a mesma foto do produto que vai no Telegram) ou "arte" (a arte do Instagram).
let imagemDoGrupo = 'foto';

let urlDoSiteAtual = '';

/**
 * A arte PNG da oferta (a mesma do Instagram), que o robô publica no blog em /social/. Baixa como arquivo e manda como
 * imagem de verdade: o link da foto do Mercado Livre (WebP) era aceito pelo WhatsApp, mas o canal não publicava.
 */
async function baixarArte(id) {
  const nome = `${id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-feed.png`;
  try {
    const r = await fetch(`${urlDoSiteAtual.replace(/\/+$/, '')}/social/${nome}`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return undefined;
    const png = Buffer.from(await r.arrayBuffer());
    // JPEG é o formato mais aceito em canais (e mais leve). Sem o sharp instalado, segue com o PNG.
    try {
      const { default: sharp } = await import('sharp');
      return { buffer: await sharp(png).jpeg({ quality: 85 }).toBuffer(), mimetype: 'image/jpeg' };
    } catch {
      return { buffer: png, mimetype: 'image/png' };
    }
  } catch {
    return undefined;
  }
}

/** A foto do produto, a mesma que o robô manda no Telegram, em JPEG ou PNG (o que o WhatsApp aceita em grupo). */
async function baixarFoto(url) {
  for (const endereco of enderecosDaFoto(url)) {
    try {
      const r = await fetch(endereco, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) continue;
      const bruto = Buffer.from(await r.arrayBuffer());
      const tipo = (r.headers.get('content-type') ?? '').split(';')[0];
      if (tipo === 'image/jpeg' || tipo === 'image/png') return { buffer: bruto, mimetype: tipo };
      // Outro formato (WebP): converte com o sharp, se estiver instalado.
      try {
        const { default: sharp } = await import('sharp');
        return { buffer: await sharp(bruto).jpeg({ quality: 88 }).toBuffer(), mimetype: 'image/jpeg' };
      } catch {
        // sem o sharp: tenta o próximo endereço
      }
    } catch {
      // tenta o próximo endereço
    }
  }
  return undefined;
}

/**
 * A imagem do grupo: a foto do produto, igual ao Telegram. A arte do Instagram só entra com "imagemDoGrupo": "arte"
 * no config.json. Se a foto não baixar, a mensagem vai como texto com a prévia do link (nunca a arte no lugar da foto).
 */
async function imagemParaGrupo(m) {
  if (imagemDoGrupo === 'arte') return (await baixarArte(m.id)) ?? (await baixarFoto(m.imagem));
  return baixarFoto(m.imagem);
}

/**
 * Prévia do link montada por nós: quem envia é que prepara a prévia (título, descrição e miniatura vão junto com a mensagem),
 * e a biblioteca falha em buscar a página do Mercado Livre (que barra acesso automático). Aqui o título e o preço vêm do
 * texto da oferta e a miniatura vem da foto do produto (reduzida e em JPEG).
 */
async function montarPrevia(m) {
  const link = /https:\/\/\S+/.exec(m.texto)?.[0];
  if (!link) return undefined;
  const linhas = m.texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const titulo = (linhas[0] ?? '').replace(/[*🔥_~]/g, '').trim().slice(0, 100);
  const descricao = linhas.find((l) => /^💰/.test(l))?.replace(/[*💰~_]/g, '').trim() ?? '';
  let jpegThumbnail;
  if (m.imagem) {
    try {
      const r = await fetch(m.imagem, { signal: AbortSignal.timeout(20_000) });
      if (r.ok) {
        const { default: sharp } = await import('sharp');
        jpegThumbnail = await sharp(Buffer.from(await r.arrayBuffer())).resize(300, 300, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
      }
    } catch {
      // sem miniatura a prévia sai só com título e descrição
    }
  }
  return { 'canonical-url': link, 'matched-text': link, title: titulo, description: descricao, jpegThumbnail };
}

async function enviarUma(sock, jid, m) {
  // Grupo aceita imagem normalmente (a foto do produto, como no Telegram, com a legenda); canal só aceita texto.
  if (enviarImagem || jid.endsWith('@g.us')) {
    const arte = await imagemParaGrupo(m);
    if (arte) {
      try {
        recibo(await sock.sendMessage(jid, { image: arte.buffer, mimetype: arte.mimetype, caption: m.texto }), imagemDoGrupo === 'arte' ? 'arte com legenda' : 'foto do produto com legenda');
        return;
      } catch (e) {
        log(`  imagem falhou (${e.message}); enviando só o texto.`);
      }
    } else log(`  a foto do produto não baixou (${m.imagem ?? 'oferta sem foto'}); enviando o texto com a prévia do link.`);
  }
  const linkPreview = usarPrevia ? await montarPrevia(m) : undefined;
  recibo(await sock.sendMessage(jid, linkPreview ? { text: m.texto, linkPreview } : { text: m.texto }), linkPreview ? 'texto com prévia' : 'texto');
}

async function buscarFila(config) {
  const url = `${config.urlDoSite.replace(/\/+$/, '')}/whatsapp.json?t=${Date.now()}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
  const dados = await r.json();
  return Array.isArray(dados.mensagens) ? dados.mensagens : [];
}

async function rodar() {
  const config = lerConfig();
  enviarImagem = config.enviarImagem === true;
  usarPrevia = config.usarPrevia !== false;
  imagemDoGrupo = config.imagemDoGrupo === 'arte' ? 'arte' : 'foto';
  urlDoSiteAtual = config.urlDoSite;
  const sock = await conectar();
  // Os destinos vêm de WHATSAPP_DESTINOS (ajustes.env, publicado em whatsapp.json) e do config.json; a lista é recarregada a cada 10 minutos,
  // então trocar de canal ou grupo não exige reiniciar o enviador.
  let destinos = [];
  let destinosEm = 0;
  const recarregarDestinos = async () => {
    const lista = await resolverDestinos(sockAtual.sock ?? sock, { destinos: await destinosCompletos(config) });
    if (JSON.stringify(lista) !== JSON.stringify(destinos)) log(`Destinos atuais: ${lista.length}.`);
    destinos = lista;
    destinosEm = Date.now();
  };
  await recarregarDestinos();
  if (!destinos.length) log('Nenhum destino válido por enquanto: confira WHATSAPP_DESTINOS no ajustes.env. Vou tentar de novo em alguns minutos.');
  log(`Pronto. Deixe este serviço rodando. Ctrl+C para parar.`);

  let estado = lerEstado();
  const falhasSeguidas = new Map();
  // Vigia: a conexão pode morrer sem avisar (sem evento "close"). A cada 2 minutos confere se o canal de rede ainda está aberto.
  setInterval(() => {
    const ws = sockAtual.sock?.ws;
    if (sockAtual.aberto && ws && (ws.isOpen === false || ws.isClosed === true || ws.isClosing === true)) reiniciarConexao('conexão morta detectada pelo vigia');
  }, 120_000).unref?.();
  for (;;) {
    try {
      const agora = Date.now();
      if (sockAtual.aberto && agora - destinosEm > 10 * 60_000) await recarregarDestinos();
      estado = { ...estado, ...podarEstado(estado, agora) };
      const fila = await buscarFila(config);
      const pendentes = selecionarPendentes(fila, estado.enviados, agora, (config.idadeMaximaMin ?? 180) * 60_000);
      const regra = podeEnviarAgora({ agora, envios: estado.envios, maximoPorHora: config.maximoPorHora ?? 6, horaInicio: config.horaInicio ?? 8, horaFim: config.horaFim ?? 22 });
      // Sem conexão aberta não adianta tentar (e não gasta a mensagem): espera a reconexão automática.
      if (pendentes.length && regra.pode && !sockAtual.aberto) {
        log(`${pendentes.length} na fila, aguardando a conexão com o WhatsApp voltar…`);
        await pausa(15_000);
        continue;
      }
      if (pendentes.length && regra.pode && !destinos.length) {
        log(`${pendentes.length} na fila, mas não há destino válido (canal ou grupo).`);
        await pausa(60_000);
        continue;
      }
      if (pendentes.length && regra.pode) {
        const m = pendentes[0];
        // Só os destinos do nicho da oferta (e os gerais, se o filtro do geral aceitar o nicho).
        const alvos = destinos.filter((d) => destinoAceita(d, m.categoria, filtroGeral));
        log(`Enviando${m.categoria ? ` [${m.categoria}]` : ''} para ${alvos.length} destino(s): ${m.texto.split('\n')[0].slice(0, 70)}`);
        if (!alvos.length) {
          // Nenhum grupo ou canal recebe este nicho: marca como resolvida para não travar a fila.
          estado.enviados[m.id] = Date.now();
          salvarEstado(estado);
          continue;
        }
        let algumOk = false;
        let queda = false;
        for (let i = 0; i < alvos.length; i++) {
          if (i > 0) await pausa(esperaAleatoria(8000, 20_000));
          try {
            await enviarUma(sockAtual.sock, alvos[i].jid, m);
            algumOk = true;
          } catch (e) {
            log(`  falhou em ${alvos[i].jid}: ${e.message}`);
            if (ehQuedaDeConexao(e)) queda = true;
          }
        }
        if (algumOk) {
          estado.enviados[m.id] = Date.now();
          estado.envios.push(Date.now());
          falhasSeguidas.delete(m.id);
        } else if (queda && (falhasSeguidas.get(m.id) ?? 0) < 4) {
          // A conexão caiu: a mensagem está boa. Reinicia a conexão e tenta de novo depois (até 4 vezes), sem descartar.
          falhasSeguidas.set(m.id, (falhasSeguidas.get(m.id) ?? 0) + 1);
          reiniciarConexao('envio falhou por queda de conexão');
          await pausa(20_000);
          continue;
        } else {
          // Falha que não é de conexão (ou já tentou várias vezes): marca como enviada para não travar a fila.
          estado.enviados[m.id] = Date.now();
          falhasSeguidas.delete(m.id);
          log('  nenhum destino recebeu; pulei esta mensagem.');
        }
        salvarEstado(estado);
        const espera = esperaAleatoria((config.esperaMinSeg ?? 90) * 1000, (config.esperaMaxSeg ?? 240) * 1000);
        log(`Próxima em ${Math.round(espera / 1000)} s. Faltam ${pendentes.length - 1}.`);
        await pausa(espera);
        continue;
      }
      if (pendentes.length && !regra.pode) log(`${pendentes.length} na fila, aguardando: ${regra.motivo}.`);
    } catch (e) {
      log(`Aviso: ${e.message}`);
    }
    await pausa(60_000);
  }
}

/** Manda uma frase de teste para os destinos do config.json, para conferir a entrega sem esperar uma oferta. */
async function testar() {
  const config = lerConfig();
  urlDoSiteAtual = config.urlDoSite;
  const sock = await conectar();
  let destinos = await resolverDestinos(sock, { destinos: await destinosCompletos(config) });
  // "testar imagem grupo": só nos grupos (o canal não mostra imagem enviada).
  if (process.argv[4] === 'grupo') destinos = destinos.filter((d) => d.jid.endsWith('@g.us'));
  const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  // "testar imagem": manda a arte da oferta mais recente como imagem, para ver se o canal publica.
  const fila = process.argv[3] === 'imagem' || process.argv[3] === 'previa' ? await buscarFila(config) : [];
  const comArte = [];
  for (const m of [...fila].reverse()) {
    const arte = await baixarArte(m.id);
    if (arte) {
      comArte.push({ arte, m });
      break;
    }
  }
  for (const { jid } of destinos) {
    if (process.argv[3] === 'previa') {
      // Usa a oferta mais recente da fila, com a prévia montada por nós (título, preço e miniatura da foto).
      const m = fila.length ? { ...[...fila].reverse()[0] } : undefined;
      if (m) m.texto = `Teste de prévia do robô (${hora}). Se aparecer a foto do produto no cartão, a prévia funciona.\n\n${m.texto}`;
      const linkPreview = m ? await montarPrevia(m) : undefined;
      recibo(await sock.sendMessage(jid, linkPreview ? { text: m.texto, linkPreview } : { text: 'Teste de prévia sem oferta na fila.' }), 'teste de prévia');
    } else if (comArte[0]) {
      recibo(await sock.sendMessage(jid, { image: comArte[0].arte.buffer, mimetype: comArte[0].arte.mimetype, caption: `Teste de imagem do robô (${hora}). Se você viu a arte acima, o canal publica imagens.` }), 'teste de imagem');
    } else {
      recibo(await sock.sendMessage(jid, { text: `Teste do robô de ofertas (${hora}). Se você leu isto, o canal está recebendo.` }), 'teste');
    }
  }
  await pausa(5000);
  process.exit(0);
}

const comando = process.argv[2];
(comando === 'listar' ? listar() : comando === 'testar' ? testar() : rodar()).catch((e) => {
  console.error(`\nErro: ${e.message}`);
  process.exit(1);
});
