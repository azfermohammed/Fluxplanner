exports.handler = async function(event) {
  const h = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'};
  if (event.httpMethod === 'OPTIONS') return {statusCode:200,headers:h,body:''};
  if (event.httpMethod !== 'POST') return {statusCode:405,headers:h,body:JSON.stringify({error:'Method not allowed'})};
  try {
    const {system,messages,imageBase64,mimeType} = JSON.parse(event.body||'{}');
    if (!messages||!Array.isArray(messages)) return {statusCode:400,headers:h,body:JSON.stringify({error:'Invalid request'})};
    if (imageBase64) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return {statusCode:500,headers:h,body:JSON.stringify({error:'GEMINI_API_KEY not set'})};
      const lastMsg = messages[messages.length-1]?.content||'';
      const parts = [{inlineData:{mimeType:mimeType||'image/jpeg',data:imageBase64}},{text:(system?system+'\n\n':'')+lastMsg}];
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts}]})});
      if (!res.ok) {const e=await res.json().catch(()=>({}));return {statusCode:res.status,headers:h,body:JSON.stringify({error:e.error?.message||'Gemini error'})};}
      const d = await res.json();
      return {statusCode:200,headers:h,body:JSON.stringify({content:[{type:'text',text:d.candidates?.[0]?.content?.parts?.[0]?.text||''}]})};
    }
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return {statusCode:500,headers:h,body:JSON.stringify({error:'GROQ_API_KEY not set'})};
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${groqKey}`},body:JSON.stringify({model:'llama-3.3-70b-versatile',max_tokens:2048,messages:[...(system?[{role:'system',content:system}]:[]),...messages]})});
    if (!res.ok) {const e=await res.json().catch(()=>({}));return {statusCode:res.status,headers:h,body:JSON.stringify({error:e.error?.message||'Groq error'})};}
    const d = await res.json();
    return {statusCode:200,headers:h,body:JSON.stringify({content:[{type:'text',text:d.choices?.[0]?.message?.content||''}]})};
  } catch(e) {return {statusCode:500,headers:h,body:JSON.stringify({error:e.message})};}
};
