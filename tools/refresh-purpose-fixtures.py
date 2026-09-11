"""Offline: extract only reviewed code ranges from private candidate packages; never config."""
from pathlib import Path
import json,hashlib,sys
r=Path(__file__).resolve().parents[1]; fixtures=r/'functions/test/fixtures/split-overlay';root=Path(sys.argv[1]);m=json.loads((fixtures/'manifest.json').read_text());a=json.loads((root/'manifest.json').read_text());h=lambda x:hashlib.sha256(x).hexdigest()
for pkg in m['packages']:
 text=(root/pkg['name']/'source/index.js').read_text();full=text.encode();info=next(p for p in a['packages'] if p['name']==pkg['name']);pkg['archiveSha256']=info['candidateArchiveSha256'];pkg['indexSha256']=info['indexSha256']
 for part in pkg['parts']:
  name=part['file']
  if 'workflow-and' in name:start=text.index('async function enrollContactInWorkflow(');end=text.index('/**\n * Cal.com Webhook Handler',start)
  elif 'direct-message' in name:start=text.index('exports.sendDirectMessage =');end=text.index('\n});',start)+5
  elif 'public-capture' in name:start=text.index('const PUBLIC_LEAD_FIELDS =');end=text.index('async function enrollContactInWorkflow(',start)
  else:start=text.index('const CRM_LEAD_DELIVERIES_COLLECTION =');end=len(text)
  value=text[start:end];b=value.encode();assert b in full
  (fixtures/name).write_bytes(b);offset=full.index(b);part.update(startUtf8Byte=offset,endUtf8Byte=offset+len(b),sha256=h(b));part.pop('lengthUtf8Bytes',None)
 for file in pkg['moduleHashes']:pkg['moduleHashes'][file]=h((r/'functions'/file).read_bytes())
(fixtures/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
