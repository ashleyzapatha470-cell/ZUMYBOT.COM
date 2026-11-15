import express from 'express';
import pino from 'pino';
import { mkdirSync } from 'node:fs';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import { createGroupHandler } from './grupos.js';

const app=express();app.use(express.json());
const port=Number(process.env.PORT||3000);
const folder=process.env.SESSION_DIR||'./session';mkdirSync(folder,{recursive:true});
const adminToken=process.env.ADMIN_TOKEN;
let status='iniciando',sock=null,qr=null,attempt=0,paused=false;
const logger=pino({level:process.env.LOG_LEVEL||'info'});
const handleGroup = createGroupHandler({
  folder,
  logger,
  downloadMedia: msg => downloadMediaMessage(msg, 'buffer', {}),
  restart: () => process.exit(1),
});
const protect=(req,res,next)=>{if(!adminToken)return res.status(503).json({error:'Configure ADMIN_TOKEN no Render'});if(req.get('authorization')!==`Bearer ${adminToken}`)return res.status(401).json({error:'Não autorizado'});next()};
app.get('/',(_req,res)=>res.type('html').send(`<html lang="pt-br"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZUMY BOT</title><body style="font:18px system-ui;background:#101a28;color:white;padding:24px"><h1>🤖 ZUMY BOT</h1><p>Status público: <b>${status}</b></p><p>Use /health para conferir a conexão. Administração por API protegida.</p></body></html>`));
app.get('/health',(_req,res)=>res.json({ok:true,status,funcoes:paused?'pausadas':'ativas',prefixo:'/'}));
app.get('/admin/status',protect,(_req,res)=>res.json({status,paused,qrDisponivel:!!qr}));
app.post('/admin/pause',protect,(req,res)=>{
  if(typeof req.body?.paused!=='boolean')return res.status(400).json({error:'Informe paused como true ou false'});
  paused=req.body.paused;
  res.json({paused});
});
app.get('/admin/qr',protect,(_req,res)=>res.json({qr:qr||null}));
app.post('/admin/pair',protect,async(req,res)=>{const number=String(req.body.number||'').replace(/\D/g,'');if(!/^55\d{10,11}$/.test(number))return res.status(400).json({error:'Informe 55 + DDD + número'});if(!sock||!qr||status==='conectado')return res.status(409).json({error:'Já conectado ou pareamento ainda indisponível'});try{const code=await sock.requestPairingCode(number);res.json({code})}catch(e){logger.error({err:e},'Falha pareamento');res.status(500).json({error:'Não foi possível gerar código; confira os logs'})}});
app.listen(port,'0.0.0.0',()=>logger.info({port},'ZUMY HTTP iniciado'));
async function connect(){
  status='conectando';const {state,saveCreds}=await useMultiFileAuthState(folder);
  const current=makeWASocket({auth:state,logger:logger.child({module:'baileys'}),printQRInTerminal:false,markOnlineOnConnect:false, syncFullHistory:false});sock=current;
  current.ev.on('creds.update',saveCreds);
  current.ev.on('connection.update',({connection,lastDisconnect,qr:nextQr})=>{
    if(current!==sock)return;
    if(nextQr){status='aguardando_pareamento';qr=nextQr;logger.info('QR de pareamento disponível')}
    if(connection==='open'){status='conectado';qr=null;attempt=0;logger.info('ZUMY WhatsApp conectado')}
    if(connection==='close'){
      status='desconectado';qr=null;
      const code=lastDisconnect?.error?.output?.statusCode;
      logger.warn({code},'Conexão WhatsApp encerrada');
      if(code===DisconnectReason.loggedOut){status='sessao_expirada';logger.error('Sessão expirada: novo pareamento necessário');return}
      const delay=Math.min(30000,2000*2**Math.min(attempt++,4));setTimeout(()=>{if(sock===current)connect().catch(e=>logger.error({err:e},'Falha reconexão'))},delay);
    }
  });
  current.ev.on('messages.upsert',async({messages,type})=>{
    logger.info({type,quantity:messages?.length},'Evento messages.upsert');
    if(paused||type!=='notify'||current!==sock)return;
    for(const msg of messages||[]){
      if(!msg?.message||!msg.key?.remoteJid?.endsWith('@g.us'))continue;
      logger.info({chat:msg.key.remoteJid,isGroup:msg.key.remoteJid?.endsWith('@g.us')},'Mensagem recebida');
      try {
        await handleGroup(current,msg);
      } catch (error) {
        logger.error({err:error, chat:msg.key.remoteJid},'Erro ao processar mensagem de grupo');
        if (/^\//.test(msg.message.conversation || msg.message.extendedTextMessage?.text || '')) {
          await current.sendMessage(msg.key.remoteJid, {text:'Não consegui concluir o comando agora.'}, {quoted:msg})
            .catch(err => logger.warn({err}, 'Falha ao informar erro do comando'));
        }
      }
    }
  });
}
connect().catch(e=>{status='erro';logger.error({err:e},'Erro ao iniciar WhatsApp')});
