package main

// watchdogFallbackHTML is served when the backend is unreachable.
// It matches the KubeStellar Console branding (dark theme + star field)
// and auto-reloads when the backend becomes healthy.
// Shows a step-by-step progress indicator based on the startup stage
// reported by /watchdog/health (written by startup-oauth.sh).
const watchdogFallbackHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KubeStellar Console — Starting</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
.wrap{text-align:center;max-width:480px;padding:2rem}
@keyframes spin{to{transform:rotate(360deg)}}
h1{font-size:1.25rem;font-weight:500;margin-bottom:.25rem}
.subtitle{color:#94a3b8;font-size:.875rem;margin-bottom:1.5rem}

/* Steps list */
.steps{text-align:left;margin:0 auto;max-width:320px}
.step{display:flex;align-items:center;gap:.75rem;padding:.5rem 0;font-size:.875rem;color:#475569;transition:color .3s}
.step.done{color:#22c55e}
.step.active{color:#e2e8f0}
.step.waiting{color:#334155}
.step-icon{width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.step.done .step-icon::after{content:'\2713';font-size:.75rem;font-weight:700}
.step.active .step-icon{border:2px solid #6366f1;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
.step.waiting .step-icon{border:2px solid #1e293b;border-radius:50%}

/* Elapsed timer */
.elapsed{margin-top:1.25rem;font-size:.75rem;color:#475569}

.retry-btn{display:inline-block;margin-top:1rem;padding:.4rem 1rem;background:rgba(99,102,241,.1);color:#818cf8;border:1px solid rgba(99,102,241,.25);border-radius:.5rem;font-size:.8rem;cursor:pointer;text-decoration:none;transition:all .2s}
.retry-btn:hover{background:rgba(99,102,241,.2);border-color:rgba(99,102,241,.4)}

/* Tip section (#5899) */
.tip{margin-top:1.5rem;padding:.75rem 1rem;background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.15);border-radius:.5rem;font-size:.75rem;color:#94a3b8;line-height:1.5;text-align:left;min-height:3rem;display:flex;align-items:center;gap:.5rem;opacity:0;animation:tipFadeIn .5s ease forwards .8s}
.tip-label{color:#818cf8;font-weight:600;flex-shrink:0}
.tip-text{flex:1;transition:opacity .4s ease}
@keyframes tipFadeIn{to{opacity:1}}

.stars{position:fixed;inset:0;pointer-events:none}
.star{position:absolute;width:2px;height:2px;background:#fff;border-radius:50%;opacity:.3;animation:twinkle 3s ease-in-out infinite}
@keyframes twinkle{0%,100%{opacity:.2}50%{opacity:.6}}

/* Respect users who prefer reduced motion (#5904) */
@media (prefers-reduced-motion: reduce){
  .star{animation:none;opacity:.4}
  .step.active .step-icon{animation:none;border-top-color:#6366f1}
  .tip{animation:none;opacity:1}
  .tip-text{transition:none}
}
</style>
</head>
<body>
<div class="stars" id="stars"></div>
<div class="wrap">
<h1>KubeStellar Console</h1>
<p class="subtitle">Starting up&hellip;</p>

<div class="steps" id="steps">
  <div class="step waiting" data-stage="npm_install"><span class="step-icon"></span>Installing dependencies</div>
  <div class="step waiting" data-stage="frontend_build"><span class="step-icon"></span>Building frontend</div>
  <div class="step waiting" data-stage="backend_compiling"><span class="step-icon"></span>Compiling backend</div>
  <div class="step waiting" data-stage="backend_starting"><span class="step-icon"></span>Backend initializing</div>
  <div class="step waiting" data-stage="ready"><span class="step-icon"></span>Ready</div>
</div>

<div class="elapsed" id="elapsed"></div>
<div class="tip" id="tip"><span class="tip-label">Tip</span><span class="tip-text" id="tip-text">Loading&hellip;</span></div>
<a href="/" class="retry-btn" onclick="checkNow();return false;">Retry now</a>
</div>

<script>
// Star field
(function(){var s=document.getElementById('stars');for(var i=0;i<25;i++){var d=document.createElement('div');d.className='star';d.style.left=Math.random()*100+'%';d.style.top=Math.random()*100+'%';d.style.animationDelay=Math.random()*3+'s';s.appendChild(d)}})();

// Rotating tips for the loading screen (#5899). Plain text only — uses
// textContent to prevent XSS if tips ever become user-configurable (#5904).
var TIPS=[
'Press ? anywhere in the console to see all keyboard shortcuts.',
'Use the global cluster filter at the top to scope every card to specific clusters.',
'Right-click any resource for quick actions like logs, exec, and YAML view.',
'Drag cards to rearrange your dashboard. Your layout auto-saves.',
'Use Cmd/Ctrl+K to open the universal search across all clusters.',
'The Mission sidebar lets you describe what you want — the AI will figure out the kubectl.',
'Pin frequently-used dashboards so they appear at the top of the sidebar.',
'Custom dashboards can mix cards from different categories. Try the Customize button.',
'The Marketplace has 60+ CNCF project cards ready to install with one click.',
'Demo mode (toggle in Settings) lets you explore every feature without a real cluster.',
'Cards with a yellow border are showing demo data — connect a cluster to see real data.',
'The Compliance card runs OPA, Kyverno, and Falco checks across all your clusters.',
'GPU dashboards show per-namespace allocations and utilization across multi-cluster fleets.',
'Use the AI agent picker to switch between Claude, Copilot, and other agents per mission.',
'Saved missions are stored permanently — click any to re-run or fork as a template.'
];
var TIP_ROTATE_MS=8000;
var tipTextEl=document.getElementById('tip-text');
var tipIdx=Math.floor(Math.random()*TIPS.length);
// Skip the fade transition entirely when the user prefers reduced motion (#5910)
var prefersReducedMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function showTip(){
  if(!tipTextEl)return;
  if(prefersReducedMotion){
    tipTextEl.textContent=TIPS[tipIdx];
    tipIdx=(tipIdx+1)%TIPS.length;
    return;
  }
  tipTextEl.style.opacity='0';
  setTimeout(function(){tipTextEl.textContent=TIPS[tipIdx];tipTextEl.style.opacity='1';tipIdx=(tipIdx+1)%TIPS.length;},400);
}
showTip();
setInterval(showTip,TIP_ROTATE_MS);

var POLL_MS=2000;
var FORCE_RELOAD_MS=120000;
var startTime=Date.now();
var reloading=false;
var elapsedEl=document.getElementById('elapsed');

// Stage ordering
var STAGES=['npm_install','frontend_build','vite_starting','backend_compiling','backend_starting','ready'];

function normalizeStage(s){
  if(s==='vite_starting') return 'frontend_build';
  return s;
}

var devMode=false;
function updateSteps(stage){
  if(stage==='vite_starting'&&!devMode){
    devMode=true;
    var fbStep=document.querySelector('.step[data-stage="frontend_build"]');
    if(fbStep) fbStep.lastChild.textContent='Starting dev server';
  }

  var displayStage=normalizeStage(stage);
  var steps=document.querySelectorAll('.step');
  var displayStages=[];
  steps.forEach(function(el){displayStages.push(el.getAttribute('data-stage'))});

  var activeIdx=displayStages.indexOf(displayStage);

  steps.forEach(function(el,i){
    el.classList.remove('done','active','waiting');
    if(activeIdx>=0){
      if(i<activeIdx) el.classList.add('done');
      else if(i===activeIdx) el.classList.add(displayStage==='ready'?'done':'active');
      else el.classList.add('waiting');
    } else {
      el.classList.add('waiting');
    }
  });

  var subtitle=document.querySelector('.subtitle');
  var labels={
    'watchdog':'Initializing\u2026',
    'npm_install':'Installing dependencies\u2026',
    'frontend_build':'Building frontend\u2026',
    'vite_starting':'Starting dev server\u2026',
    'backend_compiling':'Compiling backend\u2026',
    'backend_starting':'Backend initializing\u2026',
    'ready':'Almost ready\u2026'
  };
  subtitle.textContent=labels[stage]||'Starting up\u2026';
}

function updateElapsed(){
  var sec=Math.floor((Date.now()-startTime)/1000);
  if(sec<5) elapsedEl.textContent='';
  else if(sec<60) elapsedEl.textContent=sec+'s elapsed';
  else elapsedEl.textContent=Math.floor(sec/60)+'m '+sec%60+'s elapsed';
}

async function checkNow(){
  if(reloading)return;
  updateElapsed();

  if(Date.now()-startTime>FORCE_RELOAD_MS){
    reloading=true;
    location.reload();
    return;
  }

  try{
    var r=await fetch('/watchdog/health',{cache:'no-store'});
    if(r.ok){
      var d=await r.json();
      var stage=d.stage||'watchdog';
      updateSteps(stage);

      if(d.backend==='ok'){
        reloading=true;
        updateSteps('ready');
        document.querySelector('.subtitle').textContent='Redirecting\u2026';
        setTimeout(function(){location.reload()},600);
        return;
      }
    }
  }catch(e){
    updateSteps('watchdog');
  }
}

setInterval(checkNow,POLL_MS);
setInterval(updateElapsed,1000);
checkNow();
</script>
</body>
</html>` + "\n"
