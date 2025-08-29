import {
	App,
	MarkdownPostProcessorContext,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	requestUrl,
} from "obsidian";

interface FreeshowPluginSettings {
	apiEndpoint: string;
	showButtonBg: string;
	showButtonText: string;
	slideButtonBg: string;
	slideButtonText: string;
}

const DEFAULT_SETTINGS: FreeshowPluginSettings = {
	apiEndpoint: "http://localhost:5505/",
	showButtonBg: "#2563eb",
	showButtonText: "#ffffff",
	slideButtonBg: "#10b981",
	slideButtonText: "#000000",
};

export default class FreeshowPlugin extends Plugin {
	settings: FreeshowPluginSettings;

	async onload() {
		await this.loadSettings();
		//this.injectStyles();
		this.applyThemeVars();

		this.addSettingTab(new FreeshowSettingTab(this.app, this));

		// Reading mode: replace trigger texts with inline buttons
		this.registerMarkdownPostProcessor((el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
			this.processElement(el);
		});
	}

	onunload() {}

	/** Walk text nodes and replace trigger patterns with buttons */
	private processElement(container: HTMLElement) {
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		const toProcess: Text[] = [];

		while (walker.nextNode()) {
			const node = walker.currentNode as Text;
			// Skip inside code/math/pre blocks
			if ((node.parentElement && node.parentElement.closest("code, pre, .math, .cm-inline-code"))) continue;
			if (!node.nodeValue) continue;

			if (node.nodeValue.includes("=>|") || node.nodeValue.includes("=>[")) {
				toProcess.push(node);
			}
		}

		for (const textNode of toProcess) {
			const frag = this.transformTextNode(textNode);
			if (frag) textNode.replaceWith(frag);
		}
	}

	/** Convert a single text node into a fragment with inline buttons in place of trigger texts */
	private transformTextNode(textNode: Text): DocumentFragment | null {
		const text = textNode.nodeValue ?? "";
		// Supports optional whitespace after =>
		const pattern = /=>\s*\|([^|]+)\||=>\s*\[([^\]]+)\]/g;

		let match: RegExpExecArray | null;
		let lastIndex = 0;
		let found = false;

		const frag = document.createDocumentFragment();

		while ((match = pattern.exec(text)) !== null) {
			found = true;
			// Add plain text before the match
			if (match.index > lastIndex) {
				frag.append(text.slice(lastIndex, match.index));
			}

			const showName = match[1];   // group 1: =>|show name|
			const slideName = match[2];  // group 2: =>[slide name]

			if (showName) {
				frag.append(this.makeButton("show", showName));
			} else if (slideName) {
				frag.append(this.makeButton("slide", slideName));
			}

			lastIndex = match.index + match[0].length;
		}

		// Add trailing text if any
		if (found) {
			if (lastIndex < text.length) frag.append(text.slice(lastIndex));
			return frag;
		}
		return null;
	}

	private makeButton(kind: "show" | "slide", label: string): HTMLElement {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `freeshow-btn ${kind}`;
		btn.textContent = label.trim();
		btn.setAttr("aria-label", kind === "show" ? `Select show ${label}` : `Select slide ${label}`);

		btn.addEventListener("click", async () => {
			await this.sendFreeshow(kind, label.trim());
		});

		return btn;
	}

	/** Build URL with query params and POST via requestUrl (CORS-safe). */
	private async sendFreeshow(kind: "show" | "slide", value: string) {
		const action = kind === "show" ? "name_select_show" : "name_select_slide";

		// Normalize endpoint (add http:// if user omitted scheme)
		const raw = (this.settings.apiEndpoint?.trim() || DEFAULT_SETTINGS.apiEndpoint).trim();
		let base = raw;
		try {
			new URL(raw);
		} catch {
			base = `http://${raw}`;
		}

		let urlObj: URL;
		try {
			urlObj = new URL(base);
		} catch (e) {
			new Notice("Freeshow: Invalid API endpoint.");
			return;
		}

		urlObj.searchParams.set("action", action);
		urlObj.searchParams.set("data", JSON.stringify({ value }));

		try {
			const resp = await requestUrl({
				url: urlObj.toString(),
				method: "POST",
				headers: { "Content-Type": "application/json" },
				throw: false,
			});

			if (resp.status >= 200 && resp.status < 300) {
				new Notice(`${kind === "show" ? "Show" : "Slide"} sent: “${value}”`);
			} else {
				new Notice(`Freeshow responded with ${resp.status}`.trim());
			}
		} catch (e: any) {
			console.log(urlObj.toString())
			console.error(e);
			new Notice(`Freeshow request failed: ${e?.message ?? e}`);
		}
	}

	applyThemeVars() {
		const root = document.documentElement;
		root.style.setProperty("--freeshow-show-bg", this.settings.showButtonBg);
		root.style.setProperty("--freeshow-show-fg", this.settings.showButtonText);
		root.style.setProperty("--freeshow-slide-bg", this.settings.slideButtonBg);
		root.style.setProperty("--freeshow-slide-fg", this.settings.slideButtonText);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyThemeVars();
	}
}

class FreeshowSettingTab extends PluginSettingTab {
	plugin: FreeshowPlugin;

	constructor(app: App, plugin: FreeshowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Freeshow App Endpoint")
			.setDesc("Base URL of Freeshow API instance (e.g., http://localhost:5505/).")
			.addText((text) =>
				text
					.setPlaceholder("http://localhost:5505/")
					.setValue(this.plugin.settings.apiEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.apiEndpoint = value.trim();
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Button styles" });

		new Setting(containerEl)
			.setName("Select Show: background")
			.setDesc("Set the background color for the Select Show button.")
			.addColorPicker((cp) =>
				cp
					.setValue(this.plugin.settings.showButtonBg)
					.onChange(async (value) => {
						this.plugin.settings.showButtonBg = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Select Show: text")
			.setDesc("Set the text color for the Select Show button.")
			.addColorPicker((cp) =>
				cp
					.setValue(this.plugin.settings.showButtonText)
					.onChange(async (value) => {
						this.plugin.settings.showButtonText = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Select Slide: background")
			.setDesc("Set the background color for the Select Slide button.")
			.addColorPicker((cp) =>
				cp
					.setValue(this.plugin.settings.slideButtonBg)
					.onChange(async (value) => {
						this.plugin.settings.slideButtonBg = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Select Slide: text")
			.setDesc("Set the text color for the Select Slide button.")
			.addColorPicker((cp) =>
				cp
					.setValue(this.plugin.settings.slideButtonText)
					.onChange(async (value) => {
						this.plugin.settings.slideButtonText = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
