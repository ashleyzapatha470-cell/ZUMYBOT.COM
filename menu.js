export const botNumber = '5511960649533';
export const ownerNumber = '5582996813027';

export const sections = [
  ['PRINCIPAL', '📋', 'menu|ajuda|dono|ping|status|infobot|regras'],
  ['ADMINISTRAÇÃO', '👑', 'b|d|p|ban|kick|promover|rebaixar|grupo a|grupo f|abrirgp|fechargp|marcar|linkgp|add'],
  ['SEGURANÇA', '🛡️', 'antilink on|antilink off|antispam on|antispam off|antivizu on|antivizu off|antivizu status|antigaviao on|antigaviao off|detectargado on|detectargado off|zoeira on|zoeira off'],
  ['RANKINGS', '🤣', 'rankcorno|rankmoia|rankcaloteiro|rankgaviao|rankgado|rankbebado|rankfofoqueiro|rankpreguicoso|rankdoido|rankciumento|rankpegador|ranksumido|rankchorao|ranksortudo|rankazarado'],
  ['RELACIONAMENTOS', '❤️', 'ship|casal|compatibilidade|apaixonado|crush|casamento|divorcio|beijo|namorar|quemmeama|quemmetraiu'],
  ['JOGOS', '🎮', 'jogos|verdade|desafio|verdadeoudesafio|roleta|dado|parouimpar|pedra|papel|tesoura|adivinhar|quiz|forca|sorteio|bingo'],
  ['ZOEIRAS', '😂', 'queme|eununca|confissao|segredo|azar|sorte|previsao|horoscopo|testedeamor|testedebeleza|testedeloucura|quemseria|duelo|batalha'],
  ['FIGURINHAS', '🖼️', 'fig|sticker|toimg|attp|ttp'],
  ['MÚSICAS', '🎵', 'play|buscar|musica|letra'],
  ['INTELIGÊNCIA ARTIFICIAL', '🧠', 'ia|perguntar|resumir|traduzir'],
  ['PROPRIETÁRIO', '⚙️', 'reiniciar|bloquear|desbloquear|broadcast|grupos'],
].map(([title, icon, commands]) => ({ title, icon, commands: commands.split('|') }));

const header = '🤖 *ZUMY BOT — MENU COMPLETO*\nBot: +' + botNumber + '\nDono: +' + ownerNumber + '\nPrefixo: /';
const category = ({ title, icon, commands }) =>
  icon + ' *' + title + '*\n' + commands.map(command => '/' + command).join('\n');

export function menu(selection = '') {
  if (selection.toLowerCase() === 'completo') return [header, ...sections.map(category)].join('\n\n');
  if (selection) {
    const section = /^\d+$/.test(selection) && sections[Number(selection) - 1];
    return section
      ? category(section) + '\n\nVoltar: /menu'
      : 'Escolha uma categoria de 1 a ' + sections.length + ' com /menu número.';
  }
  const index = sections.map(({ title, icon }, i) => icon + ' /menu ' + (i + 1) + ' · ' + title);
  return [header, ...index, '', 'Todos os comandos: /menu completo'].join('\n');
}
