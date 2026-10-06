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
import { esperaAleatoria, podarEstado, podeEnviarAgora, selecionarPendentes, tipoDeDestino } from './logica.mjs';

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
      const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), browser: Browsers.macOS('Desktop'), markOnlineOnConnect: false, syncFullHistory: false });
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

/** Resolve os destinos do config.json em códigos (JID). Links de canal viram o código do canal. */
async function resolverDestinos(sock, config) {
  const prontos = [];
  for (const d of config.destinos ?? []) {
    const t = tipoDeDestino(typeof d === 'string' ? d : d.jid ?? d.link);
    if (t.tipo === 'grupo' || t.tipo === 'canal') prontos.push(t.jid);
    else if (t.tipo === 'canal-por-link') {
      try {
        const meta = await sock.newsletterMetadata('invite', t.codigo);
        prontos.push(meta.id);
        const papel = meta.viewer_metadata?.role ?? 'não informado';
        log(`Canal encontrado: ${meta.thread_metadata?.name?.text ?? meta.id} (papel desta conta: ${papel}; seguidores: ${meta.thread_metadata?.subscribers_count ?? '?'})`);
        if (papel !== 'OWNER' && papel !== 'ADMIN') log('  ATENÇÃO: esta conta não é dona nem administradora do canal. O WhatsApp aceita o envio e não publica. Escaneie o QR com a conta que criou o canal.');
      } catch (e) {
        log(`Não consegui abrir o canal pelo link (${e.message}). Confira o link e se a conta é dona do canal.`);
      }
    } else log(`Destino ignorado (não entendi): ${JSON.stringify(d)}`);
  }
  return prontos;
}

/** Mostra o recibo que o WhatsApp devolveu (id e id do servidor): é a prova de que a mensagem foi aceita. */
function recibo(r, tipo) {
  log(`  ${tipo} aceito pelo WhatsApp (id ${r?.key?.id ?? '?'}, servidor ${r?.key?.server_id ?? r?.key?.serverId ?? 'sem id de servidor'}).`);
}

async function enviarUma(sock, jid, m) {
  if (m.imagem) {
    try {
      recibo(await sock.sendMessage(jid, { image: { url: m.imagem }, caption: m.texto }), 'imagem com legenda');
      return;
    } catch (e) {
      log(`  imagem falhou (${e.message}); enviando só o texto.`);
    }
  }
  recibo(await sock.sendMessage(jid, { text: m.texto }), 'texto');
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
  if (!(config.destinos ?? []).length) {
    log('config.json ainda não tem destinos. Rode "listar" (ou o listar.bat), copie o código do grupo e cole em "destinos".');
    process.exit(1);
  }
  const sock = await conectar();
  const destinos = await resolverDestinos(sock, config);
  if (!destinos.length) throw new Error('Nenhum destino válido.');
  log(`Pronto. Enviando para ${destinos.length} destino(s). Deixe esta janela aberta. Ctrl+C para parar.`);

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
      if (pendentes.length && regra.pode) {
        const m = pendentes[0];
        log(`Enviando: ${m.texto.split('\n')[0].slice(0, 70)}`);
        let algumOk = false;
        let queda = false;
        for (let i = 0; i < destinos.length; i++) {
          if (i > 0) await pausa(esperaAleatoria(8000, 20_000));
          try {
            await enviarUma(sockAtual.sock, destinos[i], m);
            algumOk = true;
          } catch (e) {
            log(`  falhou em ${destinos[i]}: ${e.message}`);
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

const comando = process.argv[2];
(comando === 'listar' ? listar() : rodar()).catch((e) => {
  console.error(`\nErro: ${e.message}`);
  process.exit(1);
});
