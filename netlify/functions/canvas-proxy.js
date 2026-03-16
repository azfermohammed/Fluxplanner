exports.handler = async function(event) {
  const h = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Content-Type':'application/json'};
  if (event.httpMethod === 'OPTIONS') return {statusCode:200,headers:h,body:''};
  const {url,token} = event.queryStringParameters||{};
  if (!url||!token) return {statusCode:400,headers:h,body:JSON.stringify({error:'Missing url or token'})};
  try {
    const res = await fetch(url,{headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}});
    return {statusCode:200,headers:h,body:JSON.stringify(await res.json())};
  } catch(e) {return {statusCode:500,headers:h,body:JSON.stringify({error:e.message})};}
};
