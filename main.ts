import { App, Editor, MarkdownView, MarkdownPostProcessorContext, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';

// Remember to rename these classes and interfaces!

interface FreeshowSettings {
	/** Base URL for the Freeshow API, e.g. http://localhost:5505 */
	endpoint: string;

	/** Action id for selecting a slide by name (defaults to Freeshow's example) */
  action: string;

  /** Trigger prefix before [slide], defaults to '>>' */
  triggerPrefix: string;

  /** Optional CSS color for the button background (e.g. #3a86ff) */
  buttonBg?: string;
}

const DEFAULT_SETTINGS: FreeshowSettings = {
	endpoint: 'http://localhost:5505',
	action: "name_select_slide",
  	triggerPrefix: ">>",
	buttonBg: ""
}

export default class FreeshowPlugin extends Plugin {
	settings: FreeshowSettings;

	async onload() {
		await this.loadSettings();

		// Register the settings Tab.
		this.addSettingTab(new FreeshowSettingTab(this.app, this));
		
		 // Replace trigger text with inline buttons in reading view / live preview
		this.registerMarkdownPostProcessor((el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
		this.transformTextToButtons(el);
		}, 1000);

		// Optional command: quickly insert a trigger
		this.addCommand({
		id: "insert-freeshow-trigger",
		name: "Insert Freeshow slide trigger",
		editorCallback: (editor) => {
			const slide = window.prompt("Slide name to control in Freeshow:");
			if (!slide) return;
			const prefix = this.settings.triggerPrefix || ">>";
			editor.replaceSelection(`${prefix} [${slide}]`);
		}
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	  /** Turn occurrences of "<prefix> [slide name]" into inline <button> elements */
	private transformTextToButtons(root: HTMLElement) {
		const prefix = (this.settings.triggerPrefix ?? ">>").trim();
		const regex = this.buildRegex(prefix);

		// Walk text nodes only, skipping code/links/etc.
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];

		while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		const parent = node.parentElement;
		if (!parent) continue;

		const tag = parent.tagName.toLowerCase();

		// Skip contexts where we should not transform
		if (["code", "pre", "samp", "kbd"].includes(tag)) continue;
		if (parent.closest("code, pre, samp, kbd")) continue;
		if (parent.closest(".freeshow-inline-btn")) continue; // don't reprocess inside our buttons
		if (!node.nodeValue) continue;

		if (regex.test(node.nodeValue)) {
			textNodes.push(node);
		}
		// Reset lastIndex because we're reusing the regex
		regex.lastIndex = 0;
		}

		for (const node of textNodes) {
		const fragment = this.replaceWithButtons(node, regex);
		node.parentNode?.replaceChild(fragment, node);
		}
	}

	/** Build a global regex for "<prefix> [slide]" */
	private buildRegex(prefix: string): RegExp {
		const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		// Allow optional spaces between prefix and [slide]
		// Capture slide name between [ ... ] (non-greedy, no closing bracket)
		return new RegExp(`${escaped}\\s*\\[([^\\]]+?)\\]`, "g");
	}

	/** Replace a text node with a fragment of text + buttons for each match */
	private replaceWithButtons(textNode: Text, regex: RegExp): DocumentFragment {
		const text = textNode.nodeValue ?? "";
		const frag = document.createDocumentFragment();

		let lastIndex = 0;
		regex.lastIndex = 0;

		let match: RegExpExecArray | null;
		while ((match = regex.exec(text)) !== null) {
		const before = text.slice(lastIndex, match.index);
		if (before) frag.appendChild(document.createTextNode(before));

		const slideName = match[1].trim();
		frag.appendChild(this.createInlineButton(slideName));

		lastIndex = regex.lastIndex;
		}

		if (lastIndex < text.length) {
		frag.appendChild(document.createTextNode(text.slice(lastIndex)));
		}

		return frag;
	}

	/** Create the clickable inline button */
	private createInlineButton(slideName: string): HTMLButtonElement {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "freeshow-inline-btn";
		btn.setAttribute("data-freeshow-slide", slideName);
		btn.textContent = slideName;

 		// Apply user-configured background if set
    	this.applyButtonStyle(btn);

		btn.addEventListener("click", async (ev) => {
		ev.preventDefault();
		await this.sendSelectSlide(slideName, btn);
		});

		return btn;
	}

	  /** Apply background style to a single button */
	private applyButtonStyle(btn: HTMLButtonElement) {
		const bg = (this.settings.buttonBg ?? "").trim();
		if (bg) {
		btn.style.background = bg;           // override theme background
		btn.style.borderColor = "transparent"; // optional: cleaner look on solid bg
		} else {
		btn.style.removeProperty("background");
		btn.style.removeProperty("border-color");
		}
	}

	/** Update all existing buttons (call after saving settings) */
	public refreshAllButtonStyles() {
		const buttons = document.querySelectorAll<HTMLButtonElement>(".freeshow-inline-btn");
		buttons.forEach((b) => this.applyButtonStyle(b));
	}


	/** Call Freeshow HTTP API */
	private async sendSelectSlide(slideName: string, btn?: HTMLButtonElement) {
		const base = (this.settings.endpoint || DEFAULT_SETTINGS.endpoint).replace(/\/+$/, "");
		const action = encodeURIComponent(this.settings.action || DEFAULT_SETTINGS.action);
		const data = encodeURIComponent(JSON.stringify({ value: slideName }));

		const url = `${base}/?action=${action}&data=${data}`;

		try {
			btn?.classList.add("is-sending");
			
			const res = await requestUrl({
				url,
				method: "POST",
				//headers: { "Content-Type": "application/json" }
			});
			
			//await fetch(url, { method: "POST" });
			//const res = await fetch(url, { method: "POST" });

			//if (!res.ok) {
				//const text = await res.text().catch(() => "");
				//throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
			//}
			// If Freeshow returns content, we don't rely on it — a success is enough
			new Notice(`Freeshow: selected “${slideName}”`, 1800);
			btn?.classList.remove("is-sending");
			btn?.classList.add("is-success");
			setTimeout(() => btn?.classList.remove("is-success"), 1200);

		} catch (e: any) {
			btn?.classList.remove("is-sending");
			btn?.classList.add("is-error");
			new Notice(`Freeshow error: ${e?.message ?? e}`, 4000);
			setTimeout(() => btn?.classList.remove("is-error"), 2000);
		}
	}
}


/** --- Settings Tab --- */
class FreeshowSettingTab extends PluginSettingTab {
  plugin: FreeshowPlugin;

  constructor(app: App, plugin: FreeshowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Freeshow Slide Buttons — Settings" });

    new Setting(containerEl)
      .setName("API endpoint")
      .setDesc("Base URL of Freeshow's HTTP API. Example: http://localhost:5505")
      .addText((t) =>
        t
          .setPlaceholder("http://localhost:5505")
          .setValue(this.plugin.settings.endpoint)
          .onChange(async (val) => {
            this.plugin.settings.endpoint = val.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Action ID")
      .setDesc("Freeshow action to run when pressing a button (default: name_select_slide).")
      .addText((t) =>
        t
          .setPlaceholder("name_select_slide")
          .setValue(this.plugin.settings.action)
          .onChange(async (val) => {
            this.plugin.settings.action = val.trim() || "name_select_slide";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Trigger prefix")
      .setDesc("Text that precedes [slide name]. Default is '>>'.")
      .addText((t) =>
        t
          .setPlaceholder(">>")
          .setValue(this.plugin.settings.triggerPrefix)
          .onChange(async (val) => {
            this.plugin.settings.triggerPrefix = val || ">>";
            await this.plugin.saveSettings();
          })
      );


	new Setting(containerEl)
      .setName("Button background color")
      .setDesc("Optional. Choose a background color for the button. Leave blank to use theme default.")
      .addText((t) => {
        t.setPlaceholder("#3a86ff")
         .setValue(this.plugin.settings.buttonBg ?? "")
         .onChange(async (val) => {
           this.plugin.settings.buttonBg = val.trim();
           await this.plugin.saveSettings();
           this.plugin.refreshAllButtonStyles();
         });

        // Turn the text input into a native color picker, but preserve manual typing.
        const input = t.inputEl as HTMLInputElement;
        // If it looks like a color (#xxxxxx) make it a color input; otherwise keep text.
        input.addEventListener("focus", () => {
          // Switch to color input only if current value is a hex color or empty
          if (!input.value || /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(input.value)) {
            input.type = "color";
          }
        });
        input.addEventListener("blur", () => {
          // Return to text so non-hex values (e.g., 'rebeccapurple') remain editable
          if (input.type === "color" && input.value && !input.value.startsWith("#")) {
            input.type = "text";
          }
        });
      })
      .addExtraButton((b) =>
        b
          .setIcon("x")
          .setTooltip("Reset to theme default")
          .onClick(async () => {
            this.plugin.settings.buttonBg = "";
            await this.plugin.saveSettings();
            this.plugin.refreshAllButtonStyles();
          })
      );
  }
}
