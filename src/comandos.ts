import { normalizar } from './categoria.ts';
import type { Banco } from './db.ts';
import { diaDe } from './db.ts';
import { TEMAS_DO_DIA, lerTemasExtras } from './temas.ts';

/**
 * Comandos pelo Telegram: você manda uma mensagem para o bot do robô e ele muda o TEMA DO DIA (ligar, desligar, criar). Só isso: nada
 * além dos 4 ajustes abaixo pode ser mudado por aqui. Segurança:
 *  - desligado enquanto TELEGRAM_COMANDOS_CHAT (o seu ID de chat) não estiver no ajustes.env;
 *  - só obedece ao seu chat privado; mensagem de qualquer outro chat, de grupo ou de canal é ignorada;
 *  - qualquer erro é engolido (o robô segue como se nada tivesse acontecido).
 * Os ajustes ficam no banco e valem por cima do ajustes.env; o robô os aplica ao montar a configuração.
 */
export const CHAVES_DOS_COMANDOS = ['TEMA_DO_DIA', 'TEMA_DO_DIA_SEMANA', 'TEMA_DO_DIA_DATA', 'TEMAS_EXTRAS'] as const;
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const RESERVADOS = ['desligar', 'hoje', 'nenhum', 'off', ...Object.keys(TEMAS_DO_DIA)];

type Env = Record<string, string | undefined>;

/** O ajustes.env de sempre, com por cima o que os comandos definiram. */
export function aplicarComandos<E extends Env>(env: E, banco: Banco): E {
  try {
    const salvos = banco.ajustesDeComando();
    const saida: Env = { ...env };
    for (const chave of CHAVES_DOS_COMANDOS) if (chave in salvos) saida[chave] = salvos[chave];
    return saida as E;
  } catch {
    return env;
  }
}

const normalizarDia = (d: string) => normalizar(d.trim()).replace(/-?feira$/, '');
const nomeDeTema = (t: string) => normalizar(t).replace(/[^a-z0-9]/g, '').slice(0, 20);

/** Palavras do tema: separadas por vírgula (ou por espaço, se não houver vírgula), sem acento, de 3 a 24 letras, até 30. */
export function palavrasDoTema(texto: string): string[] {
  const partes = texto.includes(',') ? texto.split(',') : texto.split(/\s+/);
  return [...new Set(partes.map((p) => normalizar(p.trim()).replace(/[^a-z0-9 ]/g, '')).filter((p) => p.length >= 3 && p.length <= 24))].slice(0, 30);
}

export interface ResultadoDoComando {
  resposta: string;
  /** Se o comando mudou algum ajuste (aí o robô remonta a configuração). */
  mudou: boolean;
}

/** Executa um comando (texto do tipo "/tema vestidos sexta"). Nunca lança erro. */
export function executarComando(texto: string, banco: Banco, agora: Date, ctx: { temaAtivo?: string } = {}): ResultadoDoComando {
  try {
    const [bruto = '', ...resto] = texto.trim().split(/\s+/);
    const comando = normalizar(bruto.replace(/@\S+$/, '')).replace(/^\//, '');
    const args = resto.join(' ').trim();
    const extras = lerTemasExtras(banco.ajustesDeComando().TEMAS_EXTRAS);
    const todos = { ...Object.fromEntries(Object.entries(TEMAS_DO_DIA).map(([k, v]) => [k, v.nome])), ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, v.nome])) };

    if (comando === 'ajuda' || comando === 'start' || comando === 'help') {
      return { mudou: false, resposta: ['Comandos do robô:', '/temas — lista os temas', '/tema vestidos — liga o tema HOJE', '/tema vestidos sexta — liga TODA sexta', '/tema desligar — desliga o tema', '/novotema calcas calça, jeans, legging — cria um tema', '/apagartema calcas — apaga um tema criado', '/status — como o robô está', 'Vale na rodada seguinte (até 30 min).'].join('\n') };
    }
    if (comando === 'temas') {
      const linhas = Object.entries(todos).map(([k, nome]) => `• ${k} — ${nome}${extras[k] ? ' (criado por você)' : ''}`);
      return { mudou: false, resposta: ['Temas:', ...linhas, '', 'Ligar: /tema NOME   ou   /tema NOME sexta', 'Criar: /novotema NOME palavra1, palavra2, palavra3'].join('\n') };
    }
    if (comando === 'status') {
      const salvos = banco.ajustesDeComando();
      const agendado = [salvos.TEMA_DO_DIA_SEMANA ? `toda ${salvos.TEMA_DO_DIA_SEMANA}` : '', salvos.TEMA_DO_DIA_DATA ? `em ${salvos.TEMA_DO_DIA_DATA}` : ''].filter(Boolean).join(' e ');
      const ultimo = banco.midiasRecentesDoInstagram(2, agora)[0];
      return { mudou: false, resposta: [`Tema de hoje: ${ctx.temaAtivo ?? 'nenhum'}`, `Tema marcado por comando: ${salvos.TEMA_DO_DIA ? `${salvos.TEMA_DO_DIA} ${agendado}`.trim() : 'nenhum'}`, `Último post no Instagram: ${ultimo ? `${ultimo.tipo} — ${ultimo.titulo.slice(0, 50)}` : 'nenhum nas últimas 48 h'}`].join('\n') };
    }
    if (comando === 'tema') {
      const [nomeBruto = '', diaBruto = ''] = args.split(/\s+/);
      const nome = nomeDeTema(nomeBruto);
      if (!nome) return { mudou: false, resposta: 'Qual tema? Exemplo: /tema vestidos   (veja a lista em /temas)' };
      if (['desligar', 'nenhum', 'off'].includes(nome)) {
        banco.salvarAjusteDeComando('TEMA_DO_DIA_SEMANA', '');
        banco.salvarAjusteDeComando('TEMA_DO_DIA_DATA', '');
        return { mudou: true, resposta: '✅ Tema desligado. O robô volta ao normal na próxima rodada.' };
      }
      if (!todos[nome]) return { mudou: false, resposta: `Não conheço o tema "${nome}". Veja /temas ou crie com /novotema.` };
      if (diaBruto && !DIAS.includes(normalizarDia(diaBruto)) && normalizarDia(diaBruto) !== 'hoje') return { mudou: false, resposta: `Dia "${diaBruto}" não vale. Use segunda, terça, quarta, quinta, sexta, sábado, domingo (ou deixe em branco para hoje).` };
      banco.salvarAjusteDeComando('TEMA_DO_DIA', nome);
      if (diaBruto && normalizarDia(diaBruto) !== 'hoje') {
        banco.salvarAjusteDeComando('TEMA_DO_DIA_SEMANA', normalizarDia(diaBruto));
        banco.salvarAjusteDeComando('TEMA_DO_DIA_DATA', '');
        return { mudou: true, resposta: `✅ Tema "${todos[nome]}" ligado TODA ${normalizarDia(diaBruto)}. Para desligar: /tema desligar` };
      }
      banco.salvarAjusteDeComando('TEMA_DO_DIA_SEMANA', '');
      banco.salvarAjusteDeComando('TEMA_DO_DIA_DATA', diaDe(agora));
      return { mudou: true, resposta: `✅ Tema "${todos[nome]}" ligado HOJE. Amanhã volta ao normal sozinho. Vale a partir da próxima rodada.` };
    }
    if (comando === 'novotema') {
      const [nomeBruto = '', ...palavrasTexto] = args.split(/\s+/);
      const nome = nomeDeTema(nomeBruto);
      const palavras = palavrasDoTema(palavrasTexto.join(' '));
      if (!nome) return { mudou: false, resposta: 'Use: /novotema NOME palavra1, palavra2, palavra3   (exemplo: /novotema calcas calça, jeans, legging)' };
      if (RESERVADOS.includes(nome)) return { mudou: false, resposta: `"${nome}" já é um tema do robô (ou nome reservado). Escolha outro nome.` };
      if (palavras.length < 1) return { mudou: false, resposta: 'Faltaram as palavras. Exemplo: /novotema calcas calça, jeans, legging' };
      if (Object.keys(extras).length >= 10 && !extras[nome]) return { mudou: false, resposta: 'Você já tem 10 temas criados. Apague um com /apagartema NOME.' };
      extras[nome] = { nome: `Dia: ${nome}`, palavras };
      banco.salvarAjusteDeComando('TEMAS_EXTRAS', JSON.stringify(extras));
      return { mudou: true, resposta: `✅ Tema "${nome}" criado com ${palavras.length} palavras: ${palavras.join(', ')}.\nLigar hoje: /tema ${nome}\nLigar toda sexta: /tema ${nome} sexta` };
    }
    if (comando === 'apagartema') {
      const nome = nomeDeTema(args);
      if (!extras[nome]) return { mudou: false, resposta: `"${nome || args}" não é um tema criado por você. (Os do robô não se apagam.)` };
      delete extras[nome];
      banco.salvarAjusteDeComando('TEMAS_EXTRAS', JSON.stringify(extras));
      if (banco.ajustesDeComando().TEMA_DO_DIA === nome) {
        banco.salvarAjusteDeComando('TEMA_DO_DIA_SEMANA', '');
        banco.salvarAjusteDeComando('TEMA_DO_DIA_DATA', '');
      }
      return { mudou: true, resposta: `✅ Tema "${nome}" apagado.` };
    }
    return { mudou: false, resposta: 'Não entendi. Mande /ajuda para ver os comandos.' };
  } catch (e) {
    return { mudou: false, resposta: `Não consegui executar (${(e as Error).message.slice(0, 80)}). Nada foi mudado além do que já estava.` };
  }
}

type Fetch = typeof fetch;

type Botao = { text: string; callback_data: string };
type Teclado = Botao[][];

const EMOJI_DO_TEMA: Record<string, string> = { vestidos: '👗', tecnologia: '📱', cozinha: '🍳', games: '🎮' };
const botao = (text: string, data: string): Botao => ({ text, callback_data: data });
const VOLTAR: Botao = botao('⬅️ Menu', 'menu');

/** Os comandos que aparecem no botão "Menu" azul do Telegram (setMyCommands). */
export const COMANDOS_DO_MENU = [
  { command: 'menu', description: 'Abrir o menu com botões' },
  { command: 'temas', description: 'Ver os temas' },
  { command: 'status', description: 'Como o robô está' },
  { command: 'ajuda', description: 'Lista de comandos' },
];

export function menuPrincipal(): { texto: string; teclado: Teclado } {
  return {
    texto: '🤖 Robô Mata Preço\nO que você quer fazer?',
    teclado: [[botao('📅 Tema do dia', 'temas'), botao('📊 Status', 'status')], [botao('🛑 Desligar tema', 'desligar'), botao('✍️ Criar tema', 'criar')], [botao('❓ Ajuda', 'ajuda')]],
  };
}

/** Quais temas existem (de fábrica e criados), para montar os botões. */
function temasDisponiveis(banco: Banco): Array<{ chave: string; nome: string }> {
  const extras = lerTemasExtras(banco.ajustesDeComando().TEMAS_EXTRAS);
  return [...Object.entries(TEMAS_DO_DIA).map(([chave, t]) => ({ chave, nome: t.nome })), ...Object.entries(extras).map(([chave, t]) => ({ chave, nome: t.nome }))];
}

/**
 * Resposta a um toque de botão. `dado` é o callback_data (curto: o Telegram aceita até 64 bytes). Nunca lança erro; dado desconhecido
 * volta ao menu. Os toques que mudam algo passam pelo mesmo executarComando dos comandos de texto (mesmas regras e travas).
 */
export function respostaDeBotao(dado: string, banco: Banco, agora: Date, ctx: { temaAtivo?: string } = {}): { texto: string; teclado: Teclado; mudou: boolean } {
  const menu = menuPrincipal();
  const comVoltar = (texto: string, mudou = false) => ({ texto, teclado: [[VOLTAR]], mudou });
  try {
    const [acao = '', a = '', b = ''] = dado.split(':');
    // Cupom achado pelo garimpo: o toque do dono aprova ou recusa (só se ainda estiver pendente).
    if (acao === 'cp') {
      const id = Number(b);
      if (!Number.isInteger(id) || id <= 0 || (a !== 'ok' && a !== 'no')) return { ...menu, mudou: false };
      const mudou = banco.decidirCandidatoDeCupom(id, a === 'ok' ? 'aprovado' : 'recusado');
      if (!mudou) return { texto: 'Esse cupom já foi decidido antes.', teclado: [], mudou: false };
      return { texto: a === 'ok' ? '✅ Aprovado. Vai para o canal e o WhatsApp na próxima postagem de cupom.' : '❌ Ignorado. Não vai ser postado.', teclado: [], mudou: false };
    }
    if (acao === 'menu') return { ...menu, mudou: false };
    if (acao === 'status') return comVoltar(executarComando('/status', banco, agora, ctx).resposta);
    if (acao === 'ajuda') return comVoltar(executarComando('/ajuda', banco, agora, ctx).resposta);
    if (acao === 'criar') return comVoltar('✍️ Para criar um tema, escreva no chat:\n\n/novotema NOME palavra1, palavra2, palavra3\n\nExemplo:\n/novotema calcas calça, jeans, legging\n\nDepois ele aparece aqui em "Tema do dia".');
    if (acao === 'desligar') {
      const r = executarComando('/tema desligar', banco, agora, ctx);
      return { texto: r.resposta, teclado: [[VOLTAR]], mudou: r.mudou };
    }
    if (acao === 'temas') {
      const temas = temasDisponiveis(banco);
      return { texto: '📅 Qual tema?', teclado: [...temas.map((t) => [botao(`${EMOJI_DO_TEMA[t.chave] ?? '🏷️'} ${t.chave}`, `t:${t.chave}`)]), [VOLTAR]], mudou: false };
    }
    if (acao === 't' && a) {
      const nome = temasDisponiveis(banco).find((t) => t.chave === a)?.nome ?? a;
      return {
        texto: `${nome}\nQuando?`,
        teclado: [[botao('Só hoje', `h:${a}`), botao('Toda sexta', `d:${a}:sexta`)], [botao('Todo sábado', `d:${a}:sabado`), botao('Todo domingo', `d:${a}:domingo`)], [botao('⬅️ Temas', 'temas')]],
        mudou: false,
      };
    }
    if (acao === 'h' && a) {
      const r = executarComando(`/tema ${a}`, banco, agora, ctx);
      return { texto: r.resposta, teclado: [[VOLTAR]], mudou: r.mudou };
    }
    if (acao === 'd' && a && b) {
      const r = executarComando(`/tema ${a} ${b}`, banco, agora, ctx);
      return { texto: r.resposta, teclado: [[VOLTAR]], mudou: r.mudou };
    }
    return { ...menu, mudou: false };
  } catch {
    return { ...menu, mudou: false };
  }
}

/** O toque é só de navegação (menu, temas, status, ajuda, criar)? Com o menu na VPS, quem responde é ela. */
const ehNavegacao = (dado: string) => ['menu', 'temas', 'status', 'ajuda', 'criar', 't', 'whatsapp'].includes(dado.split(':')[0] ?? '');
const ehNavegacaoDeTexto = (texto: string) => ['/menu', '/start', '/ajuda', '/temas', '/status', '/whatsapp'].includes((texto.trim().split(/\s+/)[0] ?? '').replace(/@\S+$/, '').toLowerCase());

type Atualizacao = {
  update_id: number;
  message?: { text?: string; chat?: { id: number; type: string } };
  callback_query?: { id: string; data?: string; from?: { id: number }; message?: { message_id: number; chat?: { id: number; type: string } } };
};

/**
 * Lê as mensagens novas do bot (comandos de texto e toques nos botões) e executa o que o dono pediu. Devolve se algum ajuste mudou.
 * Nunca lança erro. `donoChat`: o ID do chat privado do dono; só ele é obedecido (mensagem ou botão de qualquer outro chat é ignorado).
 */
export async function lerComandosDoTelegram(banco: Banco, token: string, donoChat: string, agora: Date, ctx: { temaAtivo?: string; menuNaVps?: boolean } = {}, fetchFn: Fetch = fetch): Promise<boolean> {
  if (!token || !/^-?\d{5,}$/.test(donoChat)) return false;
  try {
    const base = `https://api.telegram.org/bot${token}`;
    const chamar = (metodo: string, corpo: Record<string, unknown>) =>
      fetchFn(`${base}/${metodo}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
    // O menu azul do Telegram (lista de comandos): configurado uma vez por versão da lista.
    const versaoDoMenu = String(COMANDOS_DO_MENU.length);
    if (banco.ajustesDeComando().TELEGRAM_MENU !== versaoDoMenu) {
      await chamar('setMyCommands', { commands: COMANDOS_DO_MENU });
      banco.salvarAjusteDeComando('TELEGRAM_MENU', versaoDoMenu);
    }
    const deslocamento = Number(banco.ajustesDeComando().TELEGRAM_OFFSET ?? '0') || 0;
    const r = await fetchFn(`${base}/getUpdates?offset=${deslocamento}&timeout=0&limit=20&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`, { signal: AbortSignal.timeout(20_000) });
    const dados = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: Atualizacao[] };
    if (!dados.ok || !dados.result?.length) return false;
    let mudou = false;
    let ultimo = deslocamento;
    for (const u of dados.result) {
      ultimo = Math.max(ultimo, u.update_id + 1);
      // Toque num botão: só vale se veio do chat privado do dono.
      const cb = u.callback_query;
      if (cb) {
        const doDono = cb.message?.chat?.type === 'private' && String(cb.message.chat.id) === donoChat && String(cb.from?.id) === donoChat;
        if (ctx.menuNaVps && cb.data && ehNavegacao(cb.data)) continue;
        await chamar('answerCallbackQuery', { callback_query_id: cb.id });
        if (!doDono || !cb.data) continue;
        const res = respostaDeBotao(cb.data, banco, agora, ctx);
        if (res.mudou) mudou = true;
        // Troca o texto da própria mensagem (o menu não vira uma fila de mensagens); se não der, manda uma nova.
        const editou = await chamar('editMessageText', { chat_id: donoChat, message_id: cb.message?.message_id, text: res.texto, reply_markup: { inline_keyboard: res.teclado } });
        const ok = editou ? ((await editou.json().catch(() => ({}))) as { ok?: boolean }).ok : false;
        if (!ok) await chamar('sendMessage', { chat_id: donoChat, text: res.texto, reply_markup: { inline_keyboard: res.teclado } });
        continue;
      }
      const m = u.message;
      // Só o chat privado do dono é obedecido.
      if (!m?.text || m.chat?.type !== 'private' || String(m.chat.id) !== donoChat || !m.text.startsWith('/')) continue;
      if (ctx.menuNaVps && ehNavegacaoDeTexto(m.text)) continue;
      const comando = m.text.trim().split(/\s+/)[0]!.replace(/@\S+$/, '').toLowerCase();
      if (comando === '/menu' || comando === '/start' || comando === '/ajuda') {
        const menu = menuPrincipal();
        await chamar('sendMessage', { chat_id: donoChat, text: menu.texto, reply_markup: { inline_keyboard: menu.teclado } });
        continue;
      }
      const res = executarComando(m.text, banco, agora, ctx);
      if (res.mudou) mudou = true;
      await chamar('sendMessage', { chat_id: donoChat, text: res.resposta, reply_markup: { inline_keyboard: [[VOLTAR]] } });
    }
    banco.salvarAjusteDeComando('TELEGRAM_OFFSET', String(ultimo));
    return mudou;
  } catch {
    return false;
  }
}
