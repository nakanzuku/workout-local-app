"use strict";

const STORAGE_KEY = "workout-local-app-data-v1";
const BACKUP_FORMAT = "workout-local-app-backup";
const BODY_PARTS = ["足", "腕", "腹"];
const TARGET_SECONDS = 40 * 60;
const DEFAULT_IDS = new Set(DEFAULT_EXERCISES.map((exercise) => exercise.id));

const elements = {
	message: document.querySelector("#app-message"),
	plannerView: document.querySelector("#planner-view"),
	managerView: document.querySelector("#manager-view"),
	generateButton: document.querySelector("#generate-button"),
	menuResult: document.querySelector("#menu-result"),
	menuList: document.querySelector("#menu-list"),
	menuNotice: document.querySelector("#menu-notice"),
	totalTime: document.querySelector("#total-time"),
	exerciseForm: document.querySelector("#exercise-form"),
	exerciseList: document.querySelector("#exercise-list"),
	exerciseCount: document.querySelector("#exercise-count"),
	importFile: document.querySelector("#import-file")
};

let savedData = createEmptyData();
let messageTimer;

function createEmptyData() {
	return { version: 1, customExercises: [], overrides: {}, deletedDefaultIds: [] };
}

function validateExercise(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("種目データの形式が正しくありません。");
	}

	const isValidText = (text, maxLength) => typeof text === "string" && text.trim().length > 0 && text.length <= maxLength;
	const isIntegerInRange = (number, minimum, maximum) => Number.isInteger(number) && number >= minimum && number <= maximum;

	if (!isValidText(value.id, 100)
		|| !isValidText(value.name, 60)
		|| !BODY_PARTS.includes(value.bodyPart)
		|| !isValidText(value.equipment, 80)
		|| !["回", "秒"].includes(value.unit)
		|| !isIntegerInRange(value.amount, 1, 9999)
		|| !isIntegerInRange(value.sets, 1, 20)
		|| !isIntegerInRange(value.restSeconds, 0, 900)
		|| typeof value.estimatedMinutes !== "number"
		|| !Number.isFinite(value.estimatedMinutes)
		|| value.estimatedMinutes < 0.5
		|| value.estimatedMinutes > 300
		|| !isValidText(value.description, 1000)
		|| typeof value.enabled !== "boolean") {
		throw new Error("種目の項目、または入力値が正しくありません。");
	}

	return {
		id: value.id,
		name: value.name.trim(),
		bodyPart: value.bodyPart,
		equipment: value.equipment.trim(),
		unit: value.unit,
		amount: value.amount,
		sets: value.sets,
		restSeconds: value.restSeconds,
		estimatedMinutes: value.estimatedMinutes,
		description: value.description.trim(),
		enabled: value.enabled
	};
}

function validateSavedData(value) {
	if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1
		|| !Array.isArray(value.customExercises)
		|| !value.overrides || typeof value.overrides !== "object" || Array.isArray(value.overrides)
		|| !Array.isArray(value.deletedDefaultIds)) {
		throw new Error("バックアップのデータ形式が正しくありません。");
	}

	const customExercises = value.customExercises.map(validateExercise);
	const customIds = new Set();
	customExercises.forEach((exercise) => {
		if (DEFAULT_IDS.has(exercise.id) || customIds.has(exercise.id)) {
			throw new Error("追加種目のIDが重複しているか、初期種目のIDと重なっています。");
		}
		customIds.add(exercise.id);
	});

	const overrides = {};
	Object.entries(value.overrides).forEach(([id, rawExercise]) => {
		const exercise = validateExercise(rawExercise);
		if (!DEFAULT_IDS.has(id) || exercise.id !== id) {
			throw new Error("初期種目の編集データに不正なIDがあります。");
		}
		overrides[id] = exercise;
	});

	const deletedDefaultIds = [...new Set(value.deletedDefaultIds)];
	if (deletedDefaultIds.some((id) => typeof id !== "string" || !DEFAULT_IDS.has(id))) {
		throw new Error("削除済み種目の記録に不正なIDがあります。");
	}

	return { version: 1, customExercises, overrides, deletedDefaultIds };
}

function loadSavedData() {
	try {
		const rawData = localStorage.getItem(STORAGE_KEY);
		if (rawData) savedData = validateSavedData(JSON.parse(rawData));
	} catch (error) {
		savedData = createEmptyData();
		showMessage(`保存データを読み込めませんでした。種目一覧は初期状態です。${error.message}`, true);
	}
}

function persistSavedData() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData));
		return true;
	} catch (error) {
		showMessage("ブラウザに保存できませんでした。この画面を閉じると変更が失われる場合があります。", true);
		return false;
	}
}

function getExercises() {
	const defaults = DEFAULT_EXERCISES
		.filter((exercise) => !savedData.deletedDefaultIds.includes(exercise.id))
		.map((exercise) => ({
			...(savedData.overrides[exercise.id] || exercise),
			origin: savedData.overrides[exercise.id] ? "編集済み" : "初期"
		}));
	const custom = savedData.customExercises.map((exercise) => ({ ...exercise, origin: "追加" }));
	return [...defaults, ...custom];
}

function showMessage(text, isError = false) {
	window.clearTimeout(messageTimer);
	elements.message.textContent = text;
	elements.message.classList.toggle("is-error", isError);
	elements.message.hidden = false;
	messageTimer = window.setTimeout(() => { elements.message.hidden = true; }, 6000);
}

function formatMinutes(seconds) {
	const minutes = seconds / 60;
	return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

function getExerciseSeconds(exercise) {
	const activitySeconds = Math.round(exercise.estimatedMinutes * 60);
	const restSeconds = exercise.restSeconds * Math.max(0, exercise.sets - 1);
	return { activitySeconds, restSeconds, totalSeconds: activitySeconds + restSeconds };
}

function shuffle(items) {
	const result = [...items];
	for (let index = result.length - 1; index > 0; index -= 1) {
		const otherIndex = Math.floor(Math.random() * (index + 1));
		[result[index], result[otherIndex]] = [result[otherIndex], result[index]];
	}
	return result;
}

function chooseClosestMenu(candidates) {
	const shuffledCandidates = shuffle(candidates);
	const longestExercise = Math.max(...shuffledCandidates.map((exercise) => getExerciseSeconds(exercise).totalSeconds));
	const maximumSeconds = TARGET_SECONDS + longestExercise;
	const combinations = new Map([[0, []]]);

	shuffledCandidates.forEach((exercise) => {
		const duration = getExerciseSeconds(exercise).totalSeconds;
		const currentCombinations = [...combinations.entries()];
		currentCombinations.forEach(([seconds, selected]) => {
			const nextSeconds = seconds + duration;
			if (nextSeconds > maximumSeconds) return;
			const currentSelection = combinations.get(nextSeconds);
			const nextSelection = [...selected, exercise];
			if (!currentSelection || nextSelection.length > currentSelection.length) {
				combinations.set(nextSeconds, nextSelection);
			}
		});
	});

	let bestSeconds = 0;
	let bestSelection = [];
	combinations.forEach((selection, seconds) => {
		if (Math.abs(TARGET_SECONDS - seconds) < Math.abs(TARGET_SECONDS - bestSeconds)) {
			bestSeconds = seconds;
			bestSelection = selection;
		}
	});
	return { exercises: bestSelection, totalSeconds: bestSeconds };
}

function createMenuItem(exercise, index) {
	const item = document.createElement("li");
	item.className = "menu-item";
	const number = document.createElement("span");
	number.className = "menu-index";
	number.textContent = String(index + 1).padStart(2, "0");

	const details = document.createElement("div");
	const name = document.createElement("h3");
	name.textContent = exercise.name;
	const meta = document.createElement("p");
	meta.className = "menu-meta";
	meta.textContent = `${exercise.bodyPart} ・ ${exercise.amount}${exercise.unit} × ${exercise.sets}セット ・ 器具：${exercise.equipment}`;
	const description = document.createElement("p");
	description.className = "menu-description";
	description.textContent = exercise.description;
	details.append(name, meta, description);

	const duration = getExerciseSeconds(exercise);
	const time = document.createElement("div");
	time.className = "menu-duration";
	const timeValue = document.createElement("strong");
	timeValue.textContent = `${formatMinutes(duration.totalSeconds)}分`;
	const timeDetail = document.createElement("span");
	timeDetail.textContent = `運動 ${formatMinutes(duration.activitySeconds)}分 + 休憩 ${formatMinutes(duration.restSeconds)}分`;
	time.append(timeValue, timeDetail);

	item.append(number, details, time);
	return item;
}

function generateMenu() {
	const selectedParts = [...document.querySelectorAll('input[name="body-part"]:checked')].map((input) => input.value);
	if (selectedParts.length === 0) {
		showMessage("鍛えたい部位を1つ以上選択してください。", true);
		return;
	}

	const candidates = getExercises().filter((exercise) => exercise.enabled && selectedParts.includes(exercise.bodyPart));
	if (candidates.length === 0) {
		showMessage("選択した部位に有効な種目がありません。種目の管理画面で種目を追加するか、有効にしてください。", true);
		return;
	}

	const result = chooseClosestMenu(candidates);
	elements.menuList.replaceChildren(...result.exercises.map(createMenuItem));
	elements.totalTime.textContent = formatMinutes(result.totalSeconds);
	const notices = [];
	if (candidates.length < 3) {
		notices.push(`候補種目が${candidates.length}種目と少ないため、選べる組み合わせが限られています。`);
	}
	if (result.totalSeconds !== TARGET_SECONDS) {
		notices.push(`40分ちょうどには調整できませんでした。実際の合計時間は${formatMinutes(result.totalSeconds)}分です。`);
	}
	if (notices.length === 0) notices.push("選択した部位の種目から、40分に近いメニューを作成しました。");
	elements.menuNotice.textContent = notices.join(" ");
	elements.menuResult.hidden = false;
	elements.menuResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

function createActionButton(label, action, className = "button button-quiet") {
	const button = document.createElement("button");
	button.className = className;
	button.type = "button";
	button.textContent = label;
	button.addEventListener("click", action);
	return button;
}

function renderExerciseList() {
	const exercises = getExercises();
	elements.exerciseCount.textContent = String(exercises.length);
	if (exercises.length === 0) {
		const empty = document.createElement("p");
		empty.className = "empty-library";
		empty.textContent = "種目がありません。「種目を追加」から登録してください。";
		elements.exerciseList.replaceChildren(empty);
		return;
	}

	const cards = exercises.map((exercise) => {
		const card = document.createElement("article");
		card.className = `exercise-card${exercise.enabled ? "" : " is-disabled"}`;
		const details = document.createElement("div");
		const title = document.createElement("h3");
		title.textContent = exercise.name;
		const source = document.createElement("span");
		source.className = `source-tag${exercise.origin === "追加" ? " is-custom" : ""}`;
		source.textContent = exercise.origin;
		title.append(source);
		const summary = document.createElement("p");
		summary.textContent = `${exercise.bodyPart} ・ ${exercise.amount}${exercise.unit} × ${exercise.sets}セット ・ 休憩 ${exercise.restSeconds}秒 ・ 運動目安 ${exercise.estimatedMinutes}分 ・ ${exercise.equipment}`;
		const description = document.createElement("p");
		description.className = "exercise-detail";
		description.textContent = exercise.description;
		details.append(title, summary, description);

		const actions = document.createElement("div");
		actions.className = "exercise-actions";
		actions.append(
			createActionButton(exercise.enabled ? "無効にする" : "有効にする", () => toggleExercise(exercise.id)),
			createActionButton("編集", () => openExerciseForm(exercise)),
			createActionButton("削除", () => deleteExercise(exercise), "button button-quiet delete-button")
		);
		card.append(details, actions);
		return card;
	});
	elements.exerciseList.replaceChildren(...cards);
}

function toggleExercise(id) {
	const exercise = getExercises().find((item) => item.id === id);
	if (!exercise) return;
	saveExercise({ ...exercise, origin: undefined, enabled: !exercise.enabled });
	renderExerciseList();
	showMessage(`${exercise.name}を${exercise.enabled ? "無効" : "有効"}にしました。`);
}

function saveExercise(exercise) {
	const cleanExercise = validateExercise(exercise);
	if (DEFAULT_IDS.has(cleanExercise.id)) {
		savedData.overrides[cleanExercise.id] = cleanExercise;
	} else {
		const index = savedData.customExercises.findIndex((item) => item.id === cleanExercise.id);
		if (index === -1) savedData.customExercises.push(cleanExercise);
		else savedData.customExercises[index] = cleanExercise;
	}
	persistSavedData();
}

function deleteExercise(exercise) {
	if (!window.confirm(`「${exercise.name}」を削除しますか？`)) return;
	if (DEFAULT_IDS.has(exercise.id)) {
		savedData.deletedDefaultIds = [...new Set([...savedData.deletedDefaultIds, exercise.id])];
		delete savedData.overrides[exercise.id];
	} else {
		savedData.customExercises = savedData.customExercises.filter((item) => item.id !== exercise.id);
	}
	persistSavedData();
	renderExerciseList();
	showMessage(`「${exercise.name}」を削除しました。`);
}

function openExerciseForm(exercise = null) {
	const form = elements.exerciseForm;
	form.reset();
	form.elements.id.value = exercise ? exercise.id : "";
	form.elements.name.value = exercise ? exercise.name : "";
	form.elements.bodyPart.value = exercise ? exercise.bodyPart : "足";
	form.elements.equipment.value = exercise ? exercise.equipment : "なし";
	form.elements.unit.value = exercise ? exercise.unit : "回";
	form.elements.amount.value = exercise ? exercise.amount : 10;
	form.elements.sets.value = exercise ? exercise.sets : 3;
	form.elements.restSeconds.value = exercise ? exercise.restSeconds : 60;
	form.elements.estimatedMinutes.value = exercise ? exercise.estimatedMinutes : 4;
	form.elements.description.value = exercise ? exercise.description : "";
	form.elements.enabled.checked = exercise ? exercise.enabled : true;
	document.querySelector("#form-title").textContent = exercise ? "種目を編集" : "新しい種目";
	form.hidden = false;
	form.scrollIntoView({ behavior: "smooth", block: "start" });
	form.elements.name.focus({ preventScroll: true });
}

function closeExerciseForm() {
	elements.exerciseForm.hidden = true;
	elements.exerciseForm.reset();
}

function handleExerciseSubmit(event) {
	event.preventDefault();
	const form = event.currentTarget;
	const existingId = form.elements.id.value;
	const id = existingId || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const exercise = {
		id,
		name: form.elements.name.value,
		bodyPart: form.elements.bodyPart.value,
		equipment: form.elements.equipment.value,
		unit: form.elements.unit.value,
		amount: Number(form.elements.amount.value),
		sets: Number(form.elements.sets.value),
		restSeconds: Number(form.elements.restSeconds.value),
		estimatedMinutes: Number(form.elements.estimatedMinutes.value),
		description: form.elements.description.value,
		enabled: form.elements.enabled.checked
	};

	try {
		saveExercise(exercise);
		renderExerciseList();
		closeExerciseForm();
		showMessage(existingId ? "種目を更新しました。" : "種目を追加しました。");
	} catch (error) {
		showMessage(error.message, true);
	}
}

function exportBackup() {
	const backup = {
		format: BACKUP_FORMAT,
		version: 1,
		exportedAt: new Date().toISOString(),
		data: savedData
	};
	const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(file);
	const link = document.createElement("a");
	link.href = url;
	link.download = `workout-exercises-${new Date().toISOString().slice(0, 10)}.json`;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
	showMessage("種目データのバックアップを書き出しました。");
}

async function importBackup(file) {
	try {
		const backup = JSON.parse(await file.text());
		if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== 1) {
			throw new Error("このアプリのバックアップ形式ではありません。");
		}
		const importedData = validateSavedData(backup.data);
		if (!window.confirm("現在保存されている追加・編集・削除の内容を、読み込むデータで置き換えます。続けますか？")) return;
		savedData = importedData;
		if (!persistSavedData()) return;
		renderExerciseList();
		closeExerciseForm();
		showMessage("バックアップを読み込みました。");
	} catch (error) {
		showMessage(`読み込みできませんでした。${error.message}`, true);
	} finally {
		elements.importFile.value = "";
	}
}

function switchView(viewName) {
	const showPlanner = viewName === "planner";
	elements.plannerView.hidden = !showPlanner;
	elements.managerView.hidden = showPlanner;
	document.querySelectorAll(".tab-button").forEach((button) => {
		const isActive = button.dataset.view === viewName;
		button.classList.toggle("is-active", isActive);
		button.setAttribute("aria-selected", String(isActive));
	});
}

function initializeApp() {
	loadSavedData();
	renderExerciseList();
	elements.generateButton.addEventListener("click", generateMenu);
	document.querySelectorAll(".tab-button").forEach((button) => {
		button.addEventListener("click", () => switchView(button.dataset.view));
	});
	document.querySelector("#new-exercise-button").addEventListener("click", () => openExerciseForm());
	document.querySelector("#cancel-edit-button").addEventListener("click", closeExerciseForm);
	elements.exerciseForm.addEventListener("submit", handleExerciseSubmit);
	document.querySelector("#export-button").addEventListener("click", exportBackup);
	document.querySelector("#import-button").addEventListener("click", () => elements.importFile.click());
	elements.importFile.addEventListener("change", (event) => {
		const [file] = event.target.files;
		if (file) importBackup(file);
	});
}

function registerServiceWorker() {
	if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

	const appBase = new URL("./", document.baseURI);
	navigator.serviceWorker.register(new URL("sw.js", appBase), { scope: appBase.pathname })
		.catch((error) => console.warn("Service Workerの登録に失敗しました。", error));
}

initializeApp();
registerServiceWorker();
