const fs = require('fs');
const cookieConfig = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '\\.config\\flowcv\\config.json','utf8'));
const cookie = cookieConfig.cookie.includes('=') ? cookieConfig.cookie : `flowcvsidapp=${cookieConfig.cookie}`;
async function main(){
  const resumeId = 'b2379a20-a3c2-4ac7-88c2-1ce3be10768e';
  const res = await fetch(`https://app.flowcv.com/api/resumes/${resumeId}`, {headers:{Accept:'application/json', Cookie: cookie}, redirect:'manual'});
  const text = await res.text();
  console.log('STATUS', res.status);
  console.log(text.slice(0, 12000));
}
main().catch(err=>{console.error(err); process.exit(1);});
