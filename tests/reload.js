// An explicit, extension-owned maintenance action; never reloads other extensions.
document.querySelector('#version').textContent = `Version ${chrome.runtime.getManifest().version}`;
document.querySelector('#reload').onclick = () => chrome.runtime.reload();
