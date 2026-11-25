import json,sys,subprocess,os,resource,selectors,time
request=json.load(sys.stdin)
lang=request['language'];code=request['code']
# Authored Python functions have a documented JSON stdin adapter.
if lang=='python':
 code+='\n\nif __name__ == "__main__":\n    import json, sys\n    _raw = sys.stdin.read().strip()\n    if _raw:\n        _data = json.loads(_raw)\n        if "two_sum" in globals(): print(json.dumps(two_sum(**_data)))\n        elif "binary_search" in globals(): print(json.dumps(binary_search(**_data)))\n        elif "climb_stairs" in globals(): print(json.dumps(climb_stairs(_data)))\n'
 filename={'python':'main.py','javascript':'main.js','java':'Main.java','cpp':'main.cpp'}[lang]
 with open(filename,'w') as f:f.write(code)
else:
 filename={'javascript':'main.js','java':'Main.java','cpp':'main.cpp'}[lang]
 with open(filename,'w') as f:f.write(code)
if lang=='python':
 with open('instrument.py','w') as f:
  f.write("""import sys,json,runpy
_count=0
def trace(frame,event,arg):
 global _count
 if event=='line' and frame.f_code.co_filename.endswith('main.py') and frame.f_lineno <= ORIGINAL_LINES and _count<100:
  _count+=1
  values={k:repr(v)[:180] for k,v in frame.f_locals.copy().items() if not k.startswith('_') and type(v) in (int,float,str,bool,list,tuple,dict,set,type(None))}
  sys.stderr.write('STEPWISE_TRACE:'+json.dumps({'line':frame.f_lineno,'values':values})+'\\n')
 return trace
sys.settrace(trace)
runpy.run_path('main.py',run_name='__main__')
""".replace('ORIGINAL_LINES',str(len(request['code'].splitlines()))))
def execute(args,data,seconds):
 p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 p.stdin.write(data.encode());p.stdin.close();sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ,sys.stdout.buffer);sel.register(p.stderr,selectors.EVENT_READ,sys.stderr.buffer);start=time.monotonic();size=0
 try:
  while sel.get_map():
   if time.monotonic()-start>seconds:raise RuntimeError('Execution timed out')
   for key,_ in sel.select(.05):
    chunk=os.read(key.fileobj.fileno(),4096)
    if not chunk:sel.unregister(key.fileobj);continue
    size+=len(chunk)
    if size>60000:raise RuntimeError('Output exceeded limit')
    key.data.write(chunk);key.data.flush()
  return p.wait(timeout=1)
 finally:
  try:os.killpg(p.pid,9)
  except ProcessLookupError:pass
try:
 if lang=='cpp':
  if execute(['g++','-O0','-o','/exec/main','main.cpp'],'',5):sys.exit(1)
 if lang=='java':
  if execute(['javac','-J-Xmx96m','Main.java'],'',5):sys.exit(1)
 command={'python':['python3','-I','instrument.py'],'javascript':['node','--max-old-space-size=96','main.js'],'java':['java','-Xmx96m','-XX:CompressedClassSpaceSize=32m','-XX:ReservedCodeCacheSize=32m','-cp','/work','Main'],'cpp':['/exec/main']}[lang]
 sys.exit(execute(command,request['input'],3))
except Exception as e:
 print(str(e),file=sys.stderr);sys.exit(1)
