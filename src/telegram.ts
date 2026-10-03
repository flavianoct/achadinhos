import { montarMensagem } from './mensagem.ts';
import type { OfertaAvaliada } from './types.ts';

export type Fetch = typeof fetch;

export class ErroTelegram extends Error {
  /** Verdadeiro quando repetir não adianta (ex.: mensagem inválida). */
  permanente: boolean;
  constructor(mensagem: string, permanente: boolean) {
    super(mensagem);
    this.permanente = permanente;
  }
}

export interface Publicador {
  publicar(o: OfertaAvaliada): Promise<void>;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Telegram implements Publicador {
  private token: string;
  private chatId: string;
  private fetchFn: Fetch;

  constructor(token: string, chatId: string, fetchFn: Fetch = fetch) {
    this.token = token;
    this.chatId = chatId;
    this.fetchFn = fetchFn;
  }

  private async chamar(metodo: string, corpo: Record<string, unknown>, tentativa = 1): Promise<any> {
    let resposta: Response;
    try {
      resposta = await this.fetchFn(`https://api.telegram.org/bot${this.token}/${metodo}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ErroTelegram(`Sem conexão com o Telegram: ${(e as Error).message}`, false);
    }
    const dados = (await resposta.json().catch(() => ({}))) as any;
    if (dados.ok) return dados.result;

    // 429 = postando rápido demais; o Telegram diz quanto esperar.
    if (resposta.status === 429 && tentativa <= 2) {
      const espera = Number(dados.parameters?.retry_after ?? 5);
      await pausa((espera + 1) * 1000);
      return this.chamar(metodo, corpo, tentativa + 1);
    }
    const permanente = resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429;
    throw new ErroTelegram(`Telegram recusou (${resposta.status}): ${dados.description ?? 'erro desconhecido'}`, permanente);
  }

  async publicar(o: OfertaAvaliada): Promise<void> {
    const texto = montarMensagem(o);
    const botao = { inline_keyboard: [[{ text: '🛒 Ver oferta', url: o.link }]] };

    if (o.imagem) {
      try {
        await this.chamar('sendPhoto', { chat_id: this.chatId, photo: o.imagem, caption: texto, parse_mode: 'HTML', reply_markup: botao });
        return;
      } catch (e) {
        // Se a foto não carregar, o post sai só com texto. Erro de rede sobe para tentar depois.
        if (!(e instanceof ErroTelegram) || !e.permanente) throw e;
      }
    }
    await this.chamar('sendMessage', {
      chat_id: this.chatId,
      text: texto,
      parse_mode: 'HTML',
      reply_markup: botao,
      link_preview_options: { is_disabled: false },
    });
  }

  /** Confere o token e se o bot enxerga o canal. Devolve um resumo legível. */
  async checar(): Promise<string> {
    const eu = await this.chamar('getMe', {});
    const chat = await this.chamar('getChat', { chat_id: this.chatId });
    const membro = await this.chamar('getChatMember', { chat_id: this.chatId, user_id: eu.id });
    const podePostar = membro.status === 'creator' || (membro.status === 'administrator' && membro.can_post_messages !== false);
    if (!podePostar) {
      throw new ErroTelegram(`O bot @${eu.username} não é administrador de "${chat.title ?? this.chatId}" com permissão de postar.`, true);
    }
    return `bot @${eu.username} pode postar em "${chat.title ?? this.chatId}"`;
  }
}

/** Publicador do modo de teste: só mostra o post na tela. */
export class PublicadorDeTeste implements Publicador {
  async publicar(o: OfertaAvaliada): Promise<void> {
    console.log('\n──────── POST (simulado, nada foi enviado) ────────');
    console.log(montarMensagem(o).replace(/<\/?[bis]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    console.log(`[botão] Ver oferta → ${o.link}`);
    console.log(`[imagem] ${o.imagem ?? '(sem imagem)'}   [pontos] ${o.pontos}`);
    console.log('────────────────────────────────────────────────────');
  }
}
