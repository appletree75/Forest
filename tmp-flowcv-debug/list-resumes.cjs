const fs = require('fs');
const cookieConfig = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '\\.config\\flowcv\\config.json','utf8'));
const cookie = cookieConfig.cookie.includes('=') ? cookieConfig.cookie : `flowcvsidapp=${cookieConfig.cookie}`;
async function main(){
  const res = await fetch('https://app.flowcv.com/api/resumes/all', {headers:{Accept:'application/json', Cookie: cookie}, redirect:'manual'});
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
main().catch(err=>{console.error(err); process.exit(1);});
