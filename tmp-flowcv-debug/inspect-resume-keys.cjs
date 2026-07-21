const fs = require('fs');
const cookieConfig = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '\\.config\\flowcv\\config.json','utf8'));
const cookie = cookieConfig.cookie.includes('=') ? cookieConfig.cookie : `flowcvsidapp=${cookieConfig.cookie}`;
const resumeId = '5efbf77b-5eb8-4b20-9d9b-bd80125a5fa1';
(async () => {
  const res = await fetch(`https://app.flowcv.com/api/resumes/${resumeId}`, {headers:{Accept:'application/json', Cookie: cookie}, redirect:'manual'});
  const json = await res.json();
  const resume = json.data?.resume || {};
  console.log(Object.keys(resume));
  for (const key of Object.keys(resume)) {
    const val = resume[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      console.log('OBJ', key, Object.keys(val).slice(0,50));
    } else if (Array.isArray(val)) {
      console.log('ARR', key, val.length);
    }
  }
})().catch(err=>{console.error(err); process.exit(1);});
