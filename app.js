const STORAGE_KEY = "studybuddy-ai-v2";
const SESSION_KEY = "studybuddy-ai-session";
const fallbackText = `Computer Networking lecture notes. A network connects devices so they can exchange data. The TCP/IP model has application, transport, internet, and network access layers. TCP is reliable because it uses sequencing, acknowledgements, retransmission, and flow control. UDP is faster but does not guarantee delivery. An IP address identifies a device on a network. DNS converts domain names into IP addresses. HTTP is an application layer protocol used by browsers and servers. The TCP three way handshake uses SYN, SYN-ACK, and ACK to establish a connection. Congestion control reduces traffic when the network is overloaded.`;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const emptyMessages = {
  notesList: "No lectures yet. Upload a lecture PDF or load the demo lecture.",
  todayPlan: "No study tasks for today. Generate a plan from the Planner page.",
  summaryOutput: "Choose a lecture and generate an exam-ready summary.",
  quizOutput: "Generate MCQs from the active lecture.",
  flashcardOutput: "Generate flashcards from the active lecture.",
  chatLog: "Ask questions after selecting an uploaded lecture.",
  plannerOutput: "Your generated study schedule will appear here."
};

const app = loadApp();
let state = getCurrentWorkspace();
let activeView = "dashboard";
let quizSession = null;
let cardIndex = 0;
let cardFlipped = false;
let recognition = null;

document.addEventListener("DOMContentLoaded", () => {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  Object.entries(emptyMessages).forEach(([id, message]) => {
    const el = document.getElementById(id);
    if (el) el.dataset.empty = message;
  });

  bindEvents();
  applyTheme();
  routeToInitialScreen();
});

function bindEvents() {
  $("#homeSignupBtn").addEventListener("click", () => showAuth("signup"));
  $("#heroSignupBtn").addEventListener("click", () => showAuth("signup"));
  $("#homeSigninBtn").addEventListener("click", () => showAuth("signin"));
  $("#heroDemoBtn").addEventListener("click", createDemoUser);
  $("#backHomeBtn").addEventListener("click", showHome);
  $("#signupTab").addEventListener("click", () => setAuthMode("signup"));
  $("#signinTab").addEventListener("click", () => setAuthMode("signin"));
  $("#signupForm").addEventListener("submit", signUp);
  $("#signinForm").addEventListener("submit", signIn);
  $("#signOutBtn").addEventListener("click", signOut);

  $$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $$("[data-jump]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.jump)));
  $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("menu-open"));
  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#settingsBtn").addEventListener("click", openSettings);
  $("#saveApiKeyBtn").addEventListener("click", saveApiKey);
  $("#demoDataBtn").addEventListener("click", loadDemoData);
  $("#deleteAccountBtn").addEventListener("click", deleteCurrentProfile);
  $("#noteSelect").addEventListener("change", (event) => {
    state.selectedNoteId = event.target.value;
    saveWorkspace();
    renderAll();
  });

  const fileInput = $("#fileInput");
  $("#pickFileBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (event) => handleFiles(event.target.files));

  const dropZone = $("#dropZone");
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  });
  dropZone.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files));

  $("#generateSummaryBtn").addEventListener("click", generateSummary);
  $("#copySummaryBtn").addEventListener("click", copySummary);
  $("#downloadSummaryBtn").addEventListener("click", downloadSummary);
  $("#generateQuizBtn").addEventListener("click", generateQuiz);
  $("#generateCardsBtn").addEventListener("click", generateCards);
  $("#chatForm").addEventListener("submit", askQuestion);
  $("#voiceAskBtn").addEventListener("click", startVoiceAsk);
  $("#clearChatBtn").addEventListener("click", () => {
    state.chat = [];
    saveWorkspace();
    renderChat();
  });
  $("#plannerForm").addEventListener("submit", addPlannerSubject);
  $("#clearPlanBtn").addEventListener("click", () => {
    state.plans = [];
    saveWorkspace();
    renderAll();
  });
}

function loadApp() {
  const defaults = { users: {}, theme: "light", apiKey: "" };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function newWorkspace(profile) {
  return {
    profile,
    notes: [],
    selectedNoteId: "",
    summaries: {},
    quizzes: {},
    flashcards: {},
    chat: [],
    plans: [],
    stats: { quizzesTaken: 0 },
    generations: {}
  };
}

function currentSessionEmail() {
  return sessionStorage.getItem(SESSION_KEY) || "";
}

function getCurrentWorkspace() {
  const email = currentSessionEmail();
  return email && app.users[email]?.auth ? app.users[email] : null;
}

function saveApp() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
}

function saveWorkspace() {
  const email = currentSessionEmail();
  if (email) {
    app.users[email] = state;
    saveApp();
  }
}

function routeToInitialScreen() {
  if (state) {
    showApp();
  } else {
    showHome();
  }
}

function showHome() {
  $("#homeScreen").classList.remove("hidden");
  $("#authScreen").classList.add("hidden");
  $("#app").classList.add("hidden");
}

function showAuth(mode) {
  $("#homeScreen").classList.add("hidden");
  $("#authScreen").classList.remove("hidden");
  $("#app").classList.add("hidden");
  setAuthMode(mode);
}

function showApp() {
  $("#homeScreen").classList.add("hidden");
  $("#authScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  ensureSelection();
  setView(activeView);
  renderAll();
}

function setAuthMode(mode) {
  const signup = mode === "signup";
  $("#signupTab").classList.toggle("active", signup);
  $("#signinTab").classList.toggle("active", !signup);
  $("#signupForm").classList.toggle("hidden", !signup);
  $("#signinForm").classList.toggle("hidden", signup);
}

async function signUp(event) {
  event.preventDefault();
  const profile = {
    name: $("#signupName").value.trim(),
    email: $("#signupEmail").value.trim().toLowerCase(),
    course: $("#signupCourse").value.trim(),
    semester: $("#signupSemester").value.trim(),
    goal: $("#signupGoal").value.trim(),
    createdAt: new Date().toISOString()
  };
  const password = $("#signupPassword").value;
  if (!profile.name || !profile.email || password.length < 6) return;
  if (app.users[profile.email]?.auth) {
    alert("This email already has a secured profile. Sign in with the password instead.");
    setAuthMode("signin");
    $("#signinEmail").value = profile.email;
    return;
  }
  const auth = await createPasswordRecord(password);
  app.users[profile.email] = app.users[profile.email] || newWorkspace(profile);
  app.users[profile.email].profile = profile;
  app.users[profile.email].auth = auth;
  sessionStorage.setItem(SESSION_KEY, profile.email);
  state = app.users[profile.email];
  saveApp();
  event.target.reset();
  showApp();
}

async function signIn(event) {
  event.preventDefault();
  const email = $("#signinEmail").value.trim().toLowerCase();
  const password = $("#signinPassword").value;
  if (!app.users[email]) {
    $("#authMessage").textContent = "No profile found for this email. Create an account first.";
    setAuthMode("signup");
    $("#signupEmail").value = email;
    return;
  }
  if (!app.users[email].auth) {
    $("#authMessage").textContent = "This older profile has no password yet. Please create it again with a password.";
    setAuthMode("signup");
    $("#signupEmail").value = email;
    return;
  }
  const isValid = await verifyPassword(password, app.users[email].auth);
  if (!isValid) {
    $("#authMessage").textContent = "Wrong password. Access denied.";
    $("#signinPassword").value = "";
    return;
  }
  sessionStorage.setItem(SESSION_KEY, email);
  state = app.users[email];
  saveApp();
  showApp();
}

async function createPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    salt: bytesToBase64(salt),
    hash: await hashPassword(password, salt)
  };
}

async function verifyPassword(password, auth) {
  if (!auth?.salt || !auth?.hash || !password) return false;
  const salt = base64ToBytes(auth.salt);
  const hash = await hashPassword(password, salt);
  return timingSafeEqual(hash, auth.hash);
}

async function hashPassword(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function createDemoUser() {
  const email = "demo@studybuddy.local";
  if (!app.users[email]) {
    app.users[email] = newWorkspace({
      name: "Demo Student",
      email,
      course: "BS Computer Science",
      semester: "Semester 5",
      goal: "Prepare smarter for the next exam",
      createdAt: new Date().toISOString()
    });
    app.users[email].auth = await createPasswordRecord("demo123");
  }
  app.users[email].profile = app.users[email].profile || {
    name: "Demo Student",
    email,
    course: "BS Computer Science",
    semester: "Semester 5",
    goal: "Prepare smarter for the next exam",
    createdAt: new Date().toISOString()
  };
  sessionStorage.setItem(SESSION_KEY, email);
  state = app.users[email];
  if (!state.notes.length) loadDemoData(false);
  saveApp();
  showApp();
}

function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  state = null;
  saveApp();
  showHome();
}

function deleteCurrentProfile() {
  const email = currentSessionEmail();
  if (!email || !app.users[email]) return;
  const ok = confirm("Delete your profile, lectures, summaries, quizzes, flashcards, Ask history, and schedules from this browser?");
  if (!ok) return;
  delete app.users[email];
  sessionStorage.removeItem(SESSION_KEY);
  state = null;
  saveApp();
  showHome();
}

function applyTheme() {
  document.body.classList.toggle("dark", app.theme === "dark");
}

function toggleTheme() {
  app.theme = app.theme === "dark" ? "light" : "dark";
  saveApp();
  applyTheme();
}

function openSettings() {
  $("#apiKeyInput").value = app.apiKey || "";
  $("#settingsDialog").showModal();
}

function saveApiKey() {
  app.apiKey = $("#apiKeyInput").value.trim();
  saveApp();
}

function setView(view) {
  activeView = view;
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#pageTitle").textContent = view.charAt(0).toUpperCase() + view.slice(1);
  document.body.classList.remove("menu-open");
}

async function handleFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  setStatus(`Reading ${list.length} file${list.length > 1 ? "s" : ""}...`);

  for (const file of list) {
    try {
      const text = await extractFile(file);
      addNote(file.name.replace(/\.(pdf|txt|docx|pptx|png|jpe?g|webp|bmp|gif|md|csv)$/i, ""), text);
      setStatus(`Uploaded ${file.name}`);
    } catch (error) {
      setStatus(error.message || `Could not read ${file.name}. Use PDF, DOCX, PPTX, TXT, or image files.`);
    }
  }

  $("#fileInput").value = "";
  saveWorkspace();
  renderAll();
}

async function extractFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(file);
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) return extractPlainText(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".pptx")) return extractPptx(file);
  if (isImageFile(name)) return extractImageText(file);
  if (name.endsWith(".doc") || name.endsWith(".ppt")) {
    throw new Error("Old binary Office formats are not supported in this browser demo. Save as DOCX or PPTX first.");
  }
  return extractPlainText(file);
}

async function extractPlainText(file) {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  return cleanExtractedText(text);
}

async function extractPdf(file) {
  if (!window.pdfjsLib) throw new Error("PDF parser is still loading");
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    pages.push(pageText.trim());
    if (pageText.trim().length < 40 && window.Tesseract) {
      pages.push(await ocrPdfPage(page));
    }
  }
  return cleanExtractedText(pages.join("\n\n"));
}

async function extractDocx(file) {
  if (!window.mammoth) throw new Error("Word parser is still loading");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const imageText = await extractZipImageText(buffer);
  return cleanExtractedText([result.value, imageText].filter(Boolean).join("\n\n"));
}

async function extractPptx(file) {
  if (!window.JSZip) throw new Error("PowerPoint parser is still loading");
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const slides = [];
  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async("text");
    slides.push(extractXmlText(xml));
  }
  const imageText = await extractZipImageText(buffer, zip);
  return cleanExtractedText([...slides, imageText].filter(Boolean).join("\n\n"));
}

function extractXmlText(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagName("a:t"))
    .map((node) => node.textContent)
    .filter(Boolean)
    .join(" ");
}

async function extractZipImageText(buffer, existingZip) {
  if (!window.JSZip || !window.Tesseract) return "";
  const zip = existingZip || await JSZip.loadAsync(buffer);
  const imageFiles = Object.keys(zip.files).filter((name) => /\/media\/.+\.(png|jpe?g|webp|bmp|gif)$/i.test(name));
  const chunks = [];
  for (const imageFile of imageFiles.slice(0, 8)) {
    const blob = await zip.files[imageFile].async("blob");
    const text = await ocrBlob(blob);
    if (text) chunks.push(text);
  }
  return chunks.join("\n");
}

async function extractImageText(file) {
  return cleanExtractedText(await ocrBlob(file));
}

async function ocrPdfPage(page) {
  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? ocrBlob(blob) : "";
}

async function ocrBlob(blob) {
  if (!window.Tesseract) return "";
  const result = await Tesseract.recognize(blob, "eng", {
    logger: (progress) => {
      if (progress.status === "recognizing text") {
        setStatus(`Reading image text... ${Math.round(progress.progress * 100)}%`);
      }
    }
  });
  return result.data.text || "";
}

function isImageFile(name) {
  return /\.(png|jpe?g|webp|bmp|gif)$/i.test(name);
}

function addNote(title, text) {
  const cleanText = cleanExtractedText(text);
  if (!cleanText || cleanText.length < 20) throw new Error("This file did not contain enough readable text.");
  const note = {
    id: crypto.randomUUID(),
    title,
    text: cleanText,
    createdAt: new Date().toISOString(),
    wordCount: cleanText.split(/\s+/).filter(Boolean).length
  };
  state.notes.unshift(note);
  state.selectedNoteId = note.id;
}

function deleteNote(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note || !confirm(`Delete "${note.title}" and its AI outputs?`)) return;
  state.notes = state.notes.filter((item) => item.id !== noteId);
  delete state.summaries[noteId];
  delete state.quizzes[noteId];
  delete state.flashcards[noteId];
  state.chat = state.chat.filter((message) => message.noteId !== noteId);
  state.selectedNoteId = state.notes[0]?.id || "";
  saveWorkspace();
  renderAll();
}

function loadDemoData(shouldRender = true) {
  addNote("Computer Networks - TCP IP", fallbackText);
  state.plans = generatePlan("Computer Networks", nextDate(8), 2);
  saveWorkspace();
  if (shouldRender) {
    renderAll();
    setView("dashboard");
  }
}

function ensureSelection() {
  if (!state) return;
  if (!state.selectedNoteId && state.notes[0]) state.selectedNoteId = state.notes[0].id;
}

function activeNote() {
  return state.notes.find((note) => note.id === state.selectedNoteId) || state.notes[0] || null;
}

function renderAll() {
  if (!state) return;
  state.generations = state.generations || {};
  state.stats = state.stats || { quizzesTaken: 0 };
  ensureSelection();
  renderProfile();
  renderNoteSelect();
  renderDashboard();
  renderSummary();
  renderQuiz();
  renderFlashcards();
  renderChat();
  renderPlanner();
  applyTheme();
}

function renderProfile() {
  const profile = state.profile;
  $("#sidebarUser").textContent = profile.name;
  $("#profileLine").textContent = `${profile.course} | ${profile.semester}`;
  $("#welcomeTitle").textContent = `${profile.name}, your study room is ready.`;
  $("#welcomeGoal").textContent = profile.goal ? `Goal: ${profile.goal}` : "Upload a lecture to start learning.";
}

function renderNoteSelect() {
  $("#noteSelect").innerHTML = state.notes.length
    ? state.notes.map((note) => `<option value="${note.id}" ${note.id === state.selectedNoteId ? "selected" : ""}>${escapeHtml(note.title)}</option>`).join("")
    : `<option value="">No lectures uploaded</option>`;
}

function renderDashboard() {
  $("#metricNotes").textContent = state.notes.length;
  $("#metricQuizzes").textContent = state.stats.quizzesTaken || 0;
  $("#metricCards").textContent = Object.values(state.flashcards).reduce((total, cards) => total + cards.length, 0);
  $("#metricExam").textContent = nearestExamLabel();

  $("#notesList").innerHTML = state.notes.map((note) => `
    <article class="note-item">
      <div class="note-title-row">
        <div>
          <strong>${escapeHtml(note.title)}</strong>
          <div class="note-meta">${note.wordCount} words | ${formatDate(note.createdAt)}</div>
        </div>
        <button class="secondary-button" data-select-note="${note.id}" type="button">Open</button>
      </div>
      <div class="note-actions">
        <button class="ghost-button" data-action="summary" data-select-note="${note.id}" type="button">Summary</button>
        <button class="ghost-button" data-action="quiz" data-select-note="${note.id}" type="button">Quiz</button>
        <button class="ghost-button" data-action="chat" data-select-note="${note.id}" type="button">Ask</button>
        <button class="ghost-button danger-text" data-delete-note="${note.id}" type="button">Delete</button>
      </div>
    </article>
  `).join("");

  $$("#notesList [data-select-note]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedNoteId = button.dataset.selectNote;
      saveWorkspace();
      renderAll();
      if (button.dataset.action) setView(button.dataset.action);
    });
  });
  $$("#notesList [data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => deleteNote(button.dataset.deleteNote));
  });

  const todayItems = state.plans.filter((item) => item.day === todayIso()).slice(0, 4);
  $("#todayPlan").innerHTML = todayItems.map(renderTimelineItem).join("");
}

function renderSummary() {
  const note = activeNote();
  $("#summaryTitle").textContent = note ? `${note.title} summary` : "Summary";
  const summary = note ? state.summaries[note.id] : "";
  $("#summaryOutput").innerHTML = summary ? markdownish(summary) : "";
}

async function generateSummary() {
  const note = requireNote();
  if (!note) return;
  $("#summaryOutput").innerHTML = "Generating summary...";
  const variant = nextGeneration(note.id, "summary");
  const prompt = `Create a fresh version ${variant} summary from these lecture notes. Write the entire summary in the same language as the uploaded lecture. Do not translate unless the lecture itself changes language. Do not repeat the same wording or order as a previous version. Use concise exam-ready bullets, definitions, formulas, examples, and likely exam questions where useful.\n\nLecture:\n${note.text}`;
  const ai = await callGemini(prompt);
  state.summaries[note.id] = ai || localSummary(note.text, variant);
  saveWorkspace();
  renderSummary();
}

async function copySummary() {
  const note = activeNote();
  const summary = note && state.summaries[note.id];
  if (!summary) return setStatus("Generate a summary first.");
  await navigator.clipboard.writeText(summary);
  setStatus("Summary copied.");
}

function downloadSummary() {
  const note = activeNote();
  const summary = note && state.summaries[note.id];
  if (!summary) return setStatus("Generate a summary first.");
  const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${safeFileName(note.title)}-summary.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function generateQuiz() {
  const note = requireNote();
  if (!note) return;
  $("#quizOutput").innerHTML = "Generating MCQs...";
  const variant = nextGeneration(note.id, "quiz");
  const prompt = `Generate a fresh version ${variant} set of 8 MCQs from these notes. Write every question, option, answer, and explanation in the same language as the uploaded lecture. Change the concepts, question order, and option wording from earlier versions. Return only a valid JSON array with question, options, answer, and explanation.\n\nLecture:\n${note.text.slice(0, 9000)}`;
  const ai = await callGemini(prompt, true);
  state.quizzes[note.id] = Array.isArray(ai) ? sanitizeMcqs(ai) : localMcqs(note.text, variant);
  quizSession = { index: 0, score: 0, answered: false };
  saveWorkspace();
  renderQuiz();
}

function renderQuiz() {
  const note = activeNote();
  const questions = note ? state.quizzes[note.id] || [] : [];
  const box = $("#quizOutput");
  if (!questions.length) {
    box.innerHTML = "";
    return;
  }

  if (!quizSession) quizSession = { index: 0, score: 0, answered: false };
  const current = questions[quizSession.index];
  if (!current) {
    box.innerHTML = `
      <div class="quiz-card">
        <h2>Final score: ${quizSession.score}/${questions.length}</h2>
        <p class="muted">Review weak concepts in Ask, then generate a fresh quiz.</p>
        <button class="primary-button" id="restartQuizBtn" type="button">Restart quiz</button>
      </div>`;
    $("#restartQuizBtn").addEventListener("click", () => {
      quizSession = { index: 0, score: 0, answered: false };
      renderQuiz();
    });
    return;
  }

  const progress = Math.round((quizSession.index / questions.length) * 100);
  box.innerHTML = `
    <div class="quiz-card">
      <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
      <p class="eyebrow">Question ${quizSession.index + 1} of ${questions.length}</p>
      <h2>${escapeHtml(current.question)}</h2>
      <div class="option-grid">
        ${current.options.map((option, index) => `<button class="option-button" data-option="${index}" type="button">${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</button>`).join("")}
      </div>
      <div id="quizFeedback"></div>
      <button id="nextQuestionBtn" class="primary-button" type="button" disabled>Next</button>
    </div>`;

  $$(".option-button").forEach((button) => button.addEventListener("click", () => answerQuiz(Number(button.dataset.option))));
  $("#nextQuestionBtn").addEventListener("click", () => {
    quizSession.index += 1;
    quizSession.answered = false;
    if (quizSession.index >= questions.length) state.stats.quizzesTaken = (state.stats.quizzesTaken || 0) + 1;
    saveWorkspace();
    renderQuiz();
    renderDashboard();
  });
}

function answerQuiz(optionIndex) {
  if (quizSession.answered) return;
  const note = activeNote();
  const current = state.quizzes[note.id][quizSession.index];
  const correctIndex = current.answerIndex ?? current.options.findIndex((option) => option === current.answer);
  quizSession.answered = true;
  if (optionIndex === correctIndex) quizSession.score += 1;
  $$(".option-button").forEach((button) => {
    const index = Number(button.dataset.option);
    button.classList.toggle("correct", index === correctIndex);
    button.classList.toggle("wrong", index === optionIndex && index !== correctIndex);
  });
  $("#quizFeedback").innerHTML = `<p><strong>${optionIndex === correctIndex ? "Correct" : "Not quite"}.</strong> ${escapeHtml(current.explanation || "Review this concept in your lecture.")}</p>`;
  $("#nextQuestionBtn").disabled = false;
}

async function generateCards() {
  const note = requireNote();
  if (!note) return;
  $("#flashcardOutput").innerHTML = "Generating flashcards...";
  const variant = nextGeneration(note.id, "flashcards");
  const prompt = `Generate a fresh version ${variant} set of 12 flashcards from these notes. Write every flashcard in the same language as the uploaded lecture. Change the chosen terms and explanations from earlier versions. Return only a valid JSON array with front and back.\n\nLecture:\n${note.text.slice(0, 9000)}`;
  const ai = await callGemini(prompt, true);
  state.flashcards[note.id] = Array.isArray(ai) ? sanitizeCards(ai) : localFlashcards(note.text, variant);
  cardIndex = 0;
  cardFlipped = false;
  saveWorkspace();
  renderFlashcards();
}

function renderFlashcards() {
  const note = activeNote();
  const cards = note ? state.flashcards[note.id] || [] : [];
  const output = $("#flashcardOutput");
  if (!cards.length) {
    output.innerHTML = "";
    return;
  }
  const card = cards[cardIndex] || cards[0];
  output.innerHTML = `
    <div class="flashcard ${cardFlipped ? "flipped" : ""}" id="flashcard">
      <div class="flashcard-inner">
        <div class="flash-face flash-front">${escapeHtml(card.front)}</div>
        <div class="flash-face flash-back">${escapeHtml(card.back)}</div>
      </div>
    </div>
    <div class="flash-controls">
      <button class="secondary-button" id="prevCardBtn" type="button">Previous</button>
      <button class="primary-button" id="flipCardBtn" type="button">Flip</button>
      <button class="secondary-button" id="nextCardBtn" type="button">Next</button>
      <span class="muted">${cardIndex + 1}/${cards.length}</span>
    </div>`;

  $("#flashcard").addEventListener("click", flipCard);
  $("#flipCardBtn").addEventListener("click", flipCard);
  $("#prevCardBtn").addEventListener("click", () => moveCard(-1, cards.length));
  $("#nextCardBtn").addEventListener("click", () => moveCard(1, cards.length));
}

function flipCard() {
  cardFlipped = !cardFlipped;
  renderFlashcards();
}

function moveCard(delta, total) {
  cardIndex = (cardIndex + delta + total) % total;
  cardFlipped = false;
  renderFlashcards();
}

async function askQuestion(event) {
  event.preventDefault();
  await answerQuestion($("#chatInput").value.trim());
  $("#chatInput").value = "";
}

async function answerQuestion(question) {
  const note = requireNote();
  if (!note || !question) return;
  state.chat.push({ role: "user", text: question, noteId: note.id });
  renderChat();

  const prompt = `You are a lecture assistant. First read the uploaded lecture context below, then use Gemini reasoning to compose the best answer. Answer in the same language the user used in the question. If the answer is not supported by the lecture, say that clearly in the user's language and do not invent facts.\n\nUploaded lecture:\n${note.text.slice(0, 10000)}\n\nUser question:\n${question}`;
  const ai = await callGemini(prompt);
  const answer = ai || localAnswer(note.text, question);
  state.chat.push({ role: "assistant", text: answer, noteId: note.id });
  saveWorkspace();
  renderChat();
  speak(answer);
}

function startVoiceAsk() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $("#voiceStatus").textContent = "Voice input is not supported in this browser. Type your question instead.";
    return;
  }
  recognition = recognition || new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onstart = () => {
    $("#voiceAskBtn").classList.add("listening");
    $("#voiceStatus").textContent = "Listening for your lecture question...";
  };
  recognition.onresult = (event) => {
    const question = event.results[0][0].transcript;
    $("#chatInput").value = question;
    $("#voiceStatus").textContent = `Heard: ${question}`;
    answerQuestion(question);
  };
  recognition.onerror = () => {
    $("#voiceStatus").textContent = "Voice input stopped. Try again or type your question.";
  };
  recognition.onend = () => {
    $("#voiceAskBtn").classList.remove("listening");
  };
  recognition.start();
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 600));
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function renderChat() {
  $("#chatLog").innerHTML = state.chat
    .map((message) => `<div class="chat-message ${message.role === "user" ? "user" : ""}">${escapeHtml(message.text)}</div>`)
    .join("");
  $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
}

async function addPlannerSubject(event) {
  event.preventDefault();
  const subject = $("#subjectName").value.trim();
  const examDate = $("#examDate").value;
  const hours = Number($("#dailyHours").value);
  if (!subject || !examDate || !hours) return;
  $("#plannerOutput").innerHTML = "Generating study schedule...";
  const aiPlan = await generateAiPlan(subject, examDate, hours);
  const plan = aiPlan.length ? aiPlan : generatePlan(subject, examDate, hours);
  state.plans = [...state.plans.filter((item) => item.subject !== subject), ...plan].sort((a, b) => a.day.localeCompare(b.day));
  event.target.reset();
  $("#dailyHours").value = 2;
  saveWorkspace();
  renderAll();
}

function renderPlanner() {
  $("#plannerOutput").innerHTML = state.plans.map(renderTimelineItem).join("");
}

function renderTimelineItem(item) {
  return `
    <article class="timeline-item">
      <strong>${formatDate(item.day)} | ${escapeHtml(item.subject)}</strong>
      <span>${escapeHtml(item.task)}</span>
      <small class="muted">${item.hours} hour${item.hours === 1 ? "" : "s"} | ${daysUntil(item.examDate)} day${daysUntil(item.examDate) === 1 ? "" : "s"} left</small>
    </article>`;
}

function generatePlan(subject, examDate, hours) {
  const today = new Date(todayIso());
  const exam = new Date(examDate);
  const days = Math.max(1, Math.ceil((exam - today) / 86400000));
  const note = activeNote();
  const keywords = note ? topKeywords(note.text, 10) : [];
  const focus = keywords.length ? keywords : ["core concepts", "definitions", "examples", "weak areas"];
  const tasks = [
    `Map the syllabus and mark weak topics in ${subject}`,
    `Generate a summary and rewrite key definitions for ${focus[0]}`,
    `Revise ${focus[1] || "important concepts"} with flashcards`,
    `Take an MCQ quiz and review every wrong answer`,
    `Ask the lecture assistant about ${focus[2] || "confusing examples"}`,
    `Practice past-paper style questions for ${subject}`,
    `Final rapid revision and one-page cheat sheet`
  ];
  return Array.from({ length: days }, (_, index) => ({
    subject,
    examDate,
    hours,
    day: addDays(today, index),
    task: tasks[index % tasks.length]
  }));
}

async function generateAiPlan(subject, examDate, hours) {
  const note = activeNote();
  if (!app.apiKey) return [];
  const today = todayIso();
  const prompt = `Create a practical day-by-day study schedule. Use the same language as the subject name or uploaded lecture. Use the uploaded lecture content first when available. Return only a valid JSON array. Each item must have subject, examDate, hours, day, and task. Dates must be ISO YYYY-MM-DD. Start at ${today}, end before or on ${examDate}, and use ${hours} study hour(s) per day.\n\nSubject: ${subject}\nExam date: ${examDate}\nDaily hours: ${hours}\nUploaded lecture:\n${note ? note.text.slice(0, 8000) : "No lecture selected."}`;
  const ai = await callGemini(prompt, true);
  if (!Array.isArray(ai)) return [];
  return ai
    .filter((item) => item.day && item.task)
    .slice(0, 60)
    .map((item) => ({
      subject: String(item.subject || subject),
      examDate: String(item.examDate || examDate),
      hours: Number(item.hours || hours),
      day: String(item.day),
      task: String(item.task)
    }));
}

async function callGemini(prompt, expectJson = false) {
  if (!app.apiKey) return null;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(app.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) throw new Error("Gemini request failed");
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim();
    if (!expectJson) return text;
    return JSON.parse((text || "").replace(/^```json|```$/g, "").trim());
  } catch {
    setStatus("Live AI failed, so local generation was used.");
    return null;
  }
}

function nextGeneration(noteId, type) {
  state.generations = state.generations || {};
  const key = `${noteId}:${type}`;
  state.generations[key] = (state.generations[key] || 0) + 1;
  return state.generations[key];
}

function localSummary(text, variant = 1) {
  const sentences = sentencesFrom(text);
  const keywords = rotateItems(topKeywords(text, 16), variant);
  const selected = rotateItems(sentences.filter((sentence) => keywords.some((word) => sentence.toLowerCase().includes(word))), variant).slice(0, 8);
  const bullets = selected.length ? selected : sentences.slice(0, 8);
  const headings = localizedHeadings(text);
  return [headings[(variant - 1) % headings.length], ...bullets.map((sentence) => `- ${sentence}`), "", `${localizedTermsLabel(text)} ${keywords.slice(0, 12).join(", ")}`].join("\n");
}

function localMcqs(text, variant = 1) {
  const keywords = rotateItems(topKeywords(text, 18), variant).slice(0, 10);
  const sentences = sentencesFrom(text);
  return rotateItems(keywords, variant + Math.floor(Math.random() * 3)).slice(0, 8).map((term, index) => {
    const source = sentences.find((sentence) => sentence.toLowerCase().includes(term)) || sentences[index % sentences.length] || fallbackText;
    const answer = titleCase(term);
    const distractors = rotateItems(keywords.filter((word) => word !== term), index + variant).slice(0, 3).map(titleCase);
    while (distractors.length < 3) distractors.push(["Protocol", "Database", "Algorithm", "Interface"][distractors.length]);
    const options = shuffle([answer, ...distractors]).slice(0, 4);
    const arabic = hasArabicScript(text);
    return {
      question: arabic ? `اس وضاحت سے کون سا تصور مراد ہے: "${source.slice(0, 130)}..."؟` : `Which concept is best described by: "${source.slice(0, 130)}..."?`,
      options,
      answer,
      answerIndex: options.indexOf(answer),
      explanation: arabic ? `${answer} منتخب لیکچر میں اس وضاحت کے قریب موجود ہے۔` : `${answer} appears in the selected lecture near this explanation.`
    };
  });
}

function localFlashcards(text, variant = 1) {
  const keywords = rotateItems(topKeywords(text, 20), variant).slice(0, 14);
  const sentences = sentencesFrom(text);
  return rotateItems(keywords, variant + Math.floor(Math.random() * 5)).slice(0, 12).map((term) => {
    const source = sentences.find((sentence) => sentence.toLowerCase().includes(term)) || (hasArabicScript(text) ? "اس تصور کو اپ لوڈ کیے گئے لیکچر نوٹس سے دوبارہ دیکھیں۔" : "Review this concept from the uploaded lecture notes.");
    return { front: titleCase(term), back: source };
  });
}

function localAnswer(text, question) {
  const questionTokens = tokenize(question);
  const matches = sentencesFrom(text)
    .map((sentence) => ({ sentence, score: tokenize(sentence).filter((token) => questionTokens.includes(token)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!matches.length) return localizedNotFound(question);
  return `${localizedFromLecture(question)} ${matches.map((item) => item.sentence).join(" ")}`;
}

function sanitizeMcqs(items) {
  return items.filter((item) => item.question && Array.isArray(item.options)).slice(0, 10).map((item) => {
    const options = item.options.slice(0, 4).map(String);
    const answer = String(item.answer || item.correctAnswer || options[0]);
    return {
      question: String(item.question),
      options,
      answer,
      answerIndex: Math.max(0, options.findIndex((option) => option === answer)),
      explanation: String(item.explanation || "This is supported by the uploaded lecture.")
    };
  });
}

function sanitizeCards(items) {
  return items.filter((item) => item.front && item.back).slice(0, 15).map((item) => ({ front: String(item.front), back: String(item.back) }));
}

function requireNote() {
  const note = activeNote();
  if (!note) {
    setStatus("Upload a lecture or load the demo lecture first.");
    setView("upload");
    return null;
  }
  return note;
}

function setStatus(message) {
  $("#uploadStatus").textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => ($("#uploadStatus").textContent = ""), 4500);
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function cleanExtractedText(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/\uFFFD/g, " ")
    .replace(/PK\u0003\u0004|ppt\/slideLayouts|word\/document\.xml|_rels\/\.rels/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sentencesFrom(text) {
  return normalizeText(text).split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 35);
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));
}

function topKeywords(text, limit) {
  const counts = {};
  tokenize(text).forEach((word) => {
    counts[word] = (counts[word] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

function markdownish(text) {
  const lines = escapeHtml(text).split("\n");
  let html = "";
  let inList = false;
  lines.forEach((line) => {
    if (line.startsWith("- ")) {
      if (!inList) html += "<ul>";
      inList = true;
      html += `<li>${line.slice(2)}</li>`;
    } else {
      if (inList) html += "</ul>";
      inList = false;
      if (line.trim()) html += `<p>${line}</p>`;
    }
  });
  if (inList) html += "</ul>";
  return html;
}

function nearestExamLabel() {
  if (!state.plans.length) return "--";
  const next = state.plans.map((item) => item.examDate).sort()[0];
  return `${daysUntil(next)}d`;
}

function daysUntil(date) {
  return Math.max(0, Math.ceil((new Date(date) - new Date(todayIso())) / 86400000));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nextDate(days) {
  return addDays(new Date(), days);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(date));
}

function titleCase(text) {
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shuffle(items) {
  return items.map((value) => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map((item) => item.value);
}

function rotateItems(items, amount) {
  if (!items.length) return [];
  const offset = amount % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function localizedHeadings(text) {
  if (hasArabicScript(text)) return ["اہم نکات:", "نیا خلاصہ:", "امتحانی خلاصہ:"];
  return ["Key exam points:", "Fresh revision angle:", "High-yield lecture summary:"];
}

function localizedNotFound(text) {
  if (hasArabicScript(text)) return "مجھے اس کا جواب اپ لوڈ کی گئی لیکچر فائل میں نہیں ملا۔ براہ کرم لیکچر میں موجود الفاظ سے سوال پوچھیں۔";
  return "I could not find this answer in the uploaded lecture. Try asking with terms used in the notes.";
}

function localizedFromLecture(text) {
  if (hasArabicScript(text)) return "آپ کے لیکچر کے مطابق:";
  return "From your lecture:";
}

function localizedTermsLabel(text) {
  if (hasArabicScript(text)) return "اہم اصطلاحات:";
  return "High-priority terms:";
}

function hasArabicScript(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function safeFileName(value) {
  return String(value || "lecture")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const stopWords = new Set([
  "about", "after", "again", "also", "because", "before", "being", "between", "could", "each", "from", "have", "into",
  "more", "most", "notes", "only", "other", "over", "same", "should", "than", "that", "their", "there", "these", "they",
  "this", "through", "used", "uses", "using", "were", "what", "when", "where", "which", "with", "would", "your", "lecture"
]);
