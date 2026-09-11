"""Offline only: compose purpose ownership with previously verified live-source overlays.
No Firebase/auth/network operations. Archives may contain configuration: keep outputs private.
Usage: python tools/stage-purpose-overlays.py ROOT OUTPUT
"""
import sys,pathlib,subprocess,json,zipfile,hashlib,os,difflib
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(mode=0o700,parents=True,exist_ok=False)
review=pathlib.Path(__file__).resolve().parents[1];current=(review/'functions/index.js').read_text()
parent=subprocess.check_output(['git','show','cc19a5427f8cf0058f2369fb3d506e5f034fdfe6:functions/index.js'],cwd=review,text=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
def fn(text,name):
 a=text.index('async function '+name+'(');b=text.index('\n}',a)+2;return text[a:b]
def once(text,old,new):
 assert text.count(old)==1,old[:100];return text.replace(old,new,1)
def sms(text):
 for name in ['enrollContactInWorkflow','processInstance','executeWorkflowStep','sendEmail']:
  assert fn(text,name)==fn(parent,name),f'Previously reviewed helper drift: {name}'
  text=once(text,fn(parent,name),fn(current,name))
 # Preserve the live SMS provider/config fallback byte-for-byte; only add purpose to its ownership check.
 old=fn(text,'sendSMS');new=fn(current,'sendSMS').replace("runtimeConfig('plivo', 'phone_number')", "functions.config().plivo?.phone_number");text=once(text,old,new)
 text=once(text,"configFromEnv(process.env), leadData))", "configFromEnv(process.env), leadData, 'workflow'))")
 old="const triggerType = leadData.source === 'booking' ? 'booking' : 'form_submit';"
 new="const triggerType = leadData.communications?.purpose === 'lead_received' ? 'form_submit' : (leadData.source === 'booking' ? 'booking' : 'form_submit');"
 text=once(text,old,new)
 text=once(text,'enrollContactInWorkflow(context.params.leadId, workflowId, leadData)','enrollContactInWorkflow(context.params.leadId, workflowId, leadData, triggerType)')
 text=once(text,'enrollContactInWorkflow(lead.id, workflowId, lead)',"enrollContactInWorkflow(lead.id, workflowId, lead, 'campaign')")
 text=once(text,'eventTime: payload.startTime // Pass event time for relative reminders\n        });',"eventTime: payload.startTime // Pass event time for relative reminders\n        }, 'booking');")
 assert text.count("workflowId: 'direct_message'")==2
 text=text.replace("workflowId: 'direct_message'", "workflowId: 'direct_message',\n                    purpose: 'direct_message'")
 return text

def public(text):
 begin='const PUBLIC_LEAD_FIELDS = new Set([';end='async function enrollContactInWorkflow('
 original=text
 text=text[:text.index(begin)]+current[current.index(begin):current.index(end)]+text[text.index(end):]
 text="const communicationsPolicy = require('./communications-policy');\nconst crmTestAuthorization = require('./crm-test-authorization');\nconst crmTestState = require('./crm-test-state');\n"+text
 a=current.index('const CRM_LEAD_DELIVERIES_COLLECTION =');b=current.index('exports.syncOrderToCRM =',a);adapter=current[a:b]
 a=adapter.index('// Preserve the deployed v6 disabled legacy guard');b=adapter.index('// New adapter identity:',a);adapter=adapter[:a]+adapter[b:]
 text+='\n// Review-only adapter exports; exact target deployment required.\n'+adapter
 assert original[:original.index(begin)] in text and original[original.index(end):] in text
 assert text.count('exports.syncLeadToCRM =')==1
 return text

def readzip(path,digest):
 assert sha(path.read_bytes())==digest,'Baseline archive drift'
 with zipfile.ZipFile(path) as z:return {i.filename:(i,z.read(i.filename)) for i in z.infolist()}
def package(name,basePath,baseHash,source,transform,modules,targets):
 base=readzip(root/basePath,baseHash);text=transform(source).encode();folder=out/name;folder.mkdir(mode=0o700)
 entries={p:b for p,(_,b) in base.items()};entries['index.js']=text
 for m in modules:
  b=(review/'functions'/m).read_bytes()
  if m in entries:assert b==entries[m],f'Existing module drift: {m}'
  entries[m]=b
 archive=folder/'candidate.zip'
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
  for p,b in entries.items():
   i=base[p][0] if p in base else zipfile.ZipInfo(p,(1980,1,1,0,0,0))
   if p not in base:i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o600<<16
   z.writestr(i,b)
 os.chmod(archive,0o600)
 for p,b in entries.items():
  path=folder/'source'/p;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b);os.chmod(path,0o600)
 for p,(_,b) in base.items():
  if p!='index.js':assert entries[p]==b
 subprocess.run(['node','--check',str(folder/'source/index.js')],check=True)
 patch=folder/'index.patch';patch.write_text(''.join(difflib.unified_diff(base['index.js'][1].decode().splitlines(True),text.decode().splitlines(True),fromfile='live/index.js',tofile='candidate/index.js')));os.chmod(patch,0o600)
 return {'name':name,'baselineArchiveSha256':baseHash,'candidateArchiveSha256':sha(archive.read_bytes()),'indexSha256':sha(text),'runtime':json.loads(base['package.json'][1])['engines'],'targets':targets,'changedExistingFiles':['index.js'],'addedFiles':[p for p in entries if p not in base],'unchangedExistingFiles':[p for p in base if p!='index.js'],'configurationAndDependenciesPreserved':True}
previous=root/'scratch/crm-communications-overlays-v2/sms-targets/candidate.zip'
prepared=readzip(previous,'63d207bf155a31b922be1de19004f12cd307a307d40afabed5b553a93c3fa3ab')
publicPath='scratch/app-check-client-2bf92bc/submitPublicLead.zip';publicHash='11c3c95913e0c3ddad143336d84f8d691dac01a6933e5fbe76b74fbe80ba549e';publicBase=readzip(root/publicPath,publicHash)
packages=[package('sms-targets','scratch/deploy-sms-pr5-2026-09-10/onNewLead-after.zip','4429fa07197c8539efe200df5daac69f9d66d18ae469b9bf22778d87bcc78917',prepared['index.js'][1].decode(),sms,['communications-policy.js'],['onNewLead','processBulkCampaign','calcomWebhook','processWorkflowQueue','sendDirectMessage']),package('public-adapter-targets',publicPath,publicHash,publicBase['index.js'][1].decode(),public,['communications-policy.js','crm-test-authorization.js','crm-test-state.js','crm-lead-adapter.js','sms-consent.js'],['submitPublicLead','createCrmIntegrationTestAuthorization','onCanvasLeadForCRM','processCrmLeadDeliveryQueue'])]
manifest={'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=review,text=True).strip(),'sourceTreeDirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=review,text=True).strip()),'canonicalCrmHead':'4a58f5a5caf7c81ad3be895bb98fc81e23327612','packages':packages,'deploymentAuthorized':False,'freshLiveBaselineRecheckRequired':True,'excluded':['syncLeadToCRM v6','createLeadUploadSession v3','Hosting','rules','indexes','all other Functions']}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');os.chmod(out/'manifest.json',0o600);print(json.dumps(manifest,indent=2))
