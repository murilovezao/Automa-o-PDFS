(function(){
  if (typeof pdfjsLib === "undefined") {
    alert("pdf.js não carregou. Teste com internet no PC de casa.");
    return;
  }
  if (typeof JSZip === "undefined") {
    alert("JSZip não carregou. Teste com internet no PC de casa.");
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  function uid(){ return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now(); }
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function escReg(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function normalize(s){ return String(s || "").replace(/\s+/g, " ").trim(); }
  function sanitizeFileName(s){
    return String(s || "").replace(/[<>:"/\\|?*\x00-\x1f]/g,"").replace(/\s+/g," ").trim().replace(/[. ]+$/g,"");
  }
  function applyCase(s, mode){
    if(mode === "upper") return String(s).toUpperCase();
    if(mode === "lower") return String(s).toLowerCase();
    return String(s);
  }
  function setStatus(msg, cls){
    var el = document.getElementById("status");
    el.className = "status show " + cls;
    el.innerHTML = msg;
  }

  var fields = [
    // {id:uid(), label:"Nome", token:"Nome"},
    // {id:uid(), label:"Matrícula", token:"Matrícula"}
  ];
  var selectedFiles = [];

  var fieldsContainer = document.getElementById("fieldsContainer");
  var chips = document.getElementById("chips");
  var pattern = document.getElementById("pattern");
  var newLabel = document.getElementById("newLabel");
  var newToken = document.getElementById("newToken");
  var filesInput = document.getElementById("files");
  var filesInfo = document.getElementById("filesInfo");
  var results = document.getElementById("results");
  var drop = document.getElementById("drop");

  function insertAtCursor(textarea, text){
    var start = textarea.selectionStart || 0;
    var end = textarea.selectionEnd || 0;
    var value = textarea.value || "";
    textarea.value = value.slice(0,start) + text + value.slice(end);
    textarea.focus();
    var pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
  }

  function renderFields(){
    fieldsContainer.innerHTML = "";
    chips.innerHTML = "";

    fields.forEach(function(field){
      var row = document.createElement("div");
      row.className = "field-row";
      row.innerHTML =
        '<div><label>Texto do campo no PDF</label><input type="text" data-id="'+field.id+'" data-key="label" value="'+esc(field.label)+'"></div>' +
        '<div><label>Marcador no nome do arquivo</label><input type="text" data-id="'+field.id+'" data-key="token" value="'+esc(field.token)+'"></div>' +
        '<button type="button" class="danger" data-remove="'+field.id+'">Remover</button>';
      fieldsContainer.appendChild(row);

      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = "{" + field.token + "}";
      chip.addEventListener("click", function(){ insertAtCursor(pattern, "{" + field.token + "}"); });
      chips.appendChild(chip);
    });

    Array.prototype.forEach.call(fieldsContainer.querySelectorAll("input"), function(inp){
      inp.addEventListener("input", function(e){
        var id = e.target.getAttribute("data-id");
        var key = e.target.getAttribute("data-key");
        var f = fields.find(function(x){ return x.id === id; });
        if(f){ f[key] = e.target.value; renderFields(); }
      });
    });

    Array.prototype.forEach.call(fieldsContainer.querySelectorAll("button[data-remove]"), function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-remove");
        fields = fields.filter(function(x){ return x.id !== id; });
        renderFields();
      });
    });
  }

  function updateFiles(fileList){
    selectedFiles = Array.prototype.filter.call(fileList || [], function(f){ return /\.pdf$/i.test(f.name); });
    if(!selectedFiles.length){
      filesInfo.textContent = "Nenhum arquivo selecionado.";
      return;
    }
    filesInfo.innerHTML = "<strong>" + selectedFiles.length + "</strong> arquivo(s): " + selectedFiles.map(function(f){ return esc(f.name); }).join(", ");
  }

  async function extractTextFromPdf(file, pagesMode){
    var data = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({data:data}).promise;
    var maxPages = pagesMode === "all" ? pdf.numPages : 1;
    var fullText = "";

    for(var p = 1; p <= maxPages; p++){
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      fullText += " " + content.items.map(function(item){ return item.str; }).join(" ");
    }
    return normalize(fullText);
  }

  function extractValues(text){
    var values = {};
    var normalized = normalize(text);

    for(var i = 0; i < fields.length; i++){
      var current = fields[i];
      var next = fields[i+1];
      var currentLabel = normalize(current.label);
      var nextLabel = next ? normalize(next.label) : "";
      var found = "";

      if(currentLabel){
        var regex;
        if(nextLabel){
          regex = new RegExp(escReg(currentLabel) + "\\s*(.*?)\\s*" + escReg(nextLabel), "i");
        } else {
          regex = new RegExp(escReg(currentLabel) + "\\s*(.*?)(?:\\s{2,}|$)", "i");
        }
        var match = normalized.match(regex);
        if(match && match[1]) found = match[1].trim();
      }

      values[current.token || current.label] = found;
    }
    return values;
  }

  function buildName(values){
    var name = pattern.value || "";
    fields.forEach(function(field){
      var raw = values[field.token || field.label] || "";
      var transformed = applyCase(raw, document.getElementById("caseMode").value);
      name = name.split("{" + (field.token || field.label) + "}").join(transformed);
    });
    name = name.replace(/\{[^}]+\}/g,"").replace(/\s+/g," ").trim();
    name = sanitizeFileName(name);
    if(!name) name = "ARQUIVO_SEM_NOME";
    return name + ".pdf";
  }

  function renderResults(rows){
    if(!rows.length){
      results.innerHTML = '<tr><td colspan="4" class="small">Ainda não há resultados.</td></tr>';
      return;
    }
    results.innerHTML = rows.map(function(r){
      var vals = Object.keys(r.values || {}).map(function(k){
        return "<div><strong>" + esc(k) + ":</strong> " + esc(r.values[k] || "(não encontrado)") + "</div>";
      }).join("");
      return "<tr><td>"+esc(r.original)+"</td><td>"+vals+"</td><td>"+esc(r.newName)+"</td><td>"+esc(r.status)+"</td></tr>";
    }).join("");
  }

  document.getElementById("addFieldBtn").addEventListener("click", function(){
    var label = normalize(newLabel.value);
    var token = normalize(newToken.value) || label;
    if(!label){
      setStatus("Preencha o texto do campo.", "warn");
      return;
    }
    fields.push({id:uid(), label:label, token:token});
    newLabel.value = "";
    newToken.value = "";
    renderFields();
    setStatus("Campo adicionado com sucesso.", "ok");
  });

  document.getElementById("exampleBtn").addEventListener("click", function(){
    fields = [
      {id:uid(), label:"Nome", token:"Nome"},
      {id:uid(), label:"Matrícula", token:"Matrícula"},
      {id:uid(), label:"Setor", token:"Setor"}
    ];
    pattern.value = "{Matrícula} - {Nome}";
    renderFields();
    setStatus("Exemplo carregado.", "ok");
  });

  document.getElementById("clearBtn").addEventListener("click", function(){
    selectedFiles = [];
    filesInput.value = "";
    filesInfo.textContent = "Nenhum arquivo selecionado.";
    renderResults([]);
    setStatus("Tela limpa.", "ok");
  });

  drop.addEventListener("click", function(){ filesInput.click(); });
  drop.addEventListener("dragover", function(e){ e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", function(){ drop.classList.remove("drag"); });
  drop.addEventListener("drop", function(e){
    e.preventDefault();
    drop.classList.remove("drag");
    updateFiles(e.dataTransfer.files);
  });
  filesInput.addEventListener("change", function(e){ updateFiles(e.target.files); });

  document.getElementById("processBtn").addEventListener("click", async function(){
    if(!selectedFiles.length){
      setStatus("Selecione pelo menos um PDF.", "warn");
      return;
    }
    if(!fields.length){
      setStatus("Adicione pelo menos um campo.", "warn");
      return;
    }

    this.disabled = true;
    setStatus("Processando PDFs...", "info");
    var zip = new JSZip();
    var rows = [];
    var pagesMode = document.getElementById("pagesMode").value;

    try{
      for(var i=0; i<selectedFiles.length; i++){
        var file = selectedFiles[i];
        try{
          var text = await extractTextFromPdf(file, pagesMode);
          var values = extractValues(text);
          var newName = buildName(values);
          zip.file(newName, await file.arrayBuffer());
          rows.push({original:file.name, values:values, newName:newName, status:"OK"});
        }catch(err){
          rows.push({original:file.name, values:{}, newName:"-", status:"Erro ao processar"});
        }
      }

      renderResults(rows);

      var blob = await zip.generateAsync({type:"blob"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "PDFS RENOMEADOS.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("Concluído. ZIP baixado com sucesso.", "ok");
    }catch(err){
      console.error(err);
      setStatus("Erro geral ao processar os arquivos.", "err");
    }finally{
      this.disabled = false;
    }
  });

  renderFields();
  setStatus("Pronto para uso.", "info");
})();