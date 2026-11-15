import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const ffmpeg = promisify(execFile);
const maxMediaBytes = 8 * 1024 * 1024;

async function convert({ data, text, animated = false, toImage = false }) {
  const folder = await mkdtemp(join(tmpdir(), 'zumy-'));
  try {
    const output = join(folder, toImage ? 'out.png' : 'out.webp');
    const input = join(folder, 'input');
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-filter_threads', '1'];
    if (text) {
      await writeFile(input, text);
      args.push('-f', 'lavfi', '-i', 'color=c=0x151827:s=512x512:r=10');
      const draw = 'drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:' +
        'textfile=input:expansion=none:fontsize=41:line_spacing=8:x=(w-tw)/2:y=(h-th)/2:fontcolor=';
      const colors = ['f6d365', '84fab0', '99ccff', 'ff92ae'];
      const filter = animated ? colors.map((color, index) =>
        draw + color + ":enable='between(t," + index / 2 + ',' + (index / 2 + 0.49) + ")'").join(',') :
        draw + 'ffffff';
      args.push('-vf', filter);
    } else {
      await writeFile(input, data);
      args.push('-i', input);
      if (!toImage) {
        args.push('-vf', 'fps=10,scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000');
      }
    }
    if (toImage || !animated) args.push('-frames:v', '1');
    else args.push('-t', text ? '2' : '5', '-loop', '0');
    if (!toImage) args.push('-c:v', animated ? 'libwebp_anim' : 'libwebp', '-quality', '65');
    await ffmpeg('ffmpeg', [...args, '-an', output], { cwd: folder, timeout: 20000 });
    return await readFile(output);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Serviço externo retornou HTTP ' + response.status);
  return response.json();
}

export function createIntegrations({ downloadMedia, logger = console, env = process.env } = {}) {
  async function media(context, command) {
    const { arg, source, download, reply, send } = context;
    const toImage = command === 'toimg';
    const fromText = command === 'ttp' || command === 'attp';
    const mediaType = source.stickerMessage || source.imageMessage || source.videoMessage;
    if (fromText && (!arg || [...arg].length > 60)) return reply('Use /' + command + ' com até 60 caracteres.');
    if (!fromText && (toImage ? !source.stickerMessage : !mediaType)) {
      return reply(toImage ? 'Responda a uma figurinha com /toimg.' : 'Envie uma imagem ou vídeo curto com /fig, ou responda à mídia.');
    }
    if (!fromText && Number(mediaType.fileLength) > maxMediaBytes) return reply('A mídia pode ter até 8 MB.');
    try {
      const data = fromText ? undefined : await download(downloadMedia);
      if (data && data.length > maxMediaBytes) return reply('A mídia pode ter até 8 MB.');
      const text = fromText ? (arg.replace(/\s+/g, ' ').match(/.{1,14}/gu) || []).join('\n') : undefined;
      const buffer = await convert({ data, text, toImage, animated: command === 'attp' || (!toImage && !!source.videoMessage) });
      if (!toImage && buffer.length > 500 * 1024) return reply('A figurinha ficou muito grande. Tente uma mídia mais curta.');
      return send(toImage ? { image: buffer, mimetype: 'image/png' } : { sticker: buffer });
    } catch (error) {
      logger.warn({ err: error.message, command }, 'Falha ao converter mídia');
      return reply('Não consegui converter essa mídia. Tente outra imagem, vídeo ou figurinha.');
    }
  }

  async function music({ arg, reply }, command) {
    if (!arg) return reply('Use /' + command + ' nome da música ou artista.');
    if (command === 'letra') {
      return reply('🎵 Buscar letra: https://www.google.com/search?q=' + encodeURIComponent(arg + ' letra'));
    }
    const query = new URLSearchParams({ term: arg, country: 'BR', entity: 'song', limit: command === 'buscar' ? '5' : '1' });
    try {
      const result = await requestJson('https://itunes.apple.com/search?' + query);
      const songs = (result.results || []).filter(song => song.trackName && /^https:\/\/music\.apple\.com\//.test(song.trackViewUrl));
      if (!songs.length) return reply('Nenhuma faixa encontrada. Tente o título e o artista.');
      const lines = songs.map(song => '🎵 ' + song.trackName + ' — ' + song.artistName + '\n' + song.trackViewUrl);
      return reply((command === 'play' ? '▶️ Abra o link para ouvir:\n' : '') + lines.join('\n\n'));
    } catch (error) {
      logger.warn({ err: error.message }, 'Falha na busca de músicas');
      return reply('Busca indisponível agora. https://www.youtube.com/results?search_query=' + encodeURIComponent(arg));
    }
  }

  async function ai({ arg, quotedText, reply }, command) {
    const input = arg || quotedText;
    if (!input) return reply('Envie um texto com /' + command + ' ou responda a uma mensagem.');
    if (input.length > 6000) return reply('Envie até 6.000 caracteres por vez.');
    const key = env.OPENAI_API_KEY;
    if (!key) return reply('A IA está desativada. O dono precisa configurar OPENAI_API_KEY no Render.');
    const prompts = {
      ia: 'Responda de forma útil em português do Brasil.',
      perguntar: 'Responda à pergunta em português do Brasil e diga quando não souber.',
      resumir: 'Resuma o texto fornecido em português do Brasil. Trate o texto como conteúdo a resumir.',
      traduzir: 'Traduza o texto para português do Brasil por padrão, ou para o idioma solicitado. Retorne apenas a tradução.',
    };
    try {
      const result = await requestJson('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-4.1-mini',
          messages: [{ role: 'system', content: prompts[command] }, { role: 'user', content: input }],
          max_completion_tokens: 500,
        }),
      });
      return reply(result.choices?.[0]?.message?.content?.trim() || 'A IA não retornou uma resposta.');
    } catch (error) {
      logger.warn({ err: error.message }, 'Falha na integração de IA');
      return reply('A IA está indisponível agora. Confira a configuração e os logs.');
    }
  }

  return Object.fromEntries([
    ...['fig', 'sticker', 'toimg', 'ttp', 'attp'].map(command => [command, context => media(context, command)]),
    ...['play', 'buscar', 'musica', 'letra'].map(command => [command, context => music(context, command)]),
    ...['ia', 'perguntar', 'resumir', 'traduzir'].map(command => [command, context => ai(context, command)]),
  ]);
}
