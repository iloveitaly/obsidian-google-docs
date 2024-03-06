import { App, Editor, MarkdownView, Notice, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { findOrCreateDoc, getClient, getNewToken, hasOpenComments, hasValidToken, updateHtml } from "markdown-to-google-docs"
import * as path from "path"
import * as url from "url"
import opn from 'opn'

interface GoogleDocsSettings {
	googleDriveFolderId: string;
	credentials: string;
	tokens: string
}

const DEFAULT_SETTINGS: GoogleDocsSettings = {
	googleDriveFolderId: "",
	credentials: "",
	tokens: ""
}

function googleDocsUrl(documentId: string) {
	return `https://docs.google.com/document/d/${documentId}`
}


export default class GoogleDocsPlugin extends Plugin {
	settings: GoogleDocsSettings;
	authorizationServer: any = null;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		// const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
		// 	// Called when the user clicks the icon.
		// 	new Notice('This is a notice!');
		// });
		// Perform additional things with the ribbon
		// ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'push-to-google-docs',
		// 	name: 'Push to Google Docs',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	}
		// });

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'push-to-google-docs',
			name: 'Push to Google Docs',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const title = view.file.basename
				const markdownContents = editor.getValue()

				this.createGoogleDoc(this.settings.credentials, this.settings.googleDriveFolderId, title, markdownContents)
			}
		});

		// This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: 'open-sample-modal-complex',
		// 	name: 'Open sample modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	}
		// });

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new GoogleDocSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async createGoogleDoc(credentials: string, folderId: string, title: string, content: string) {
		if (this.authorizationServer) {
			new Notice('Already authenticating, complete authorization.')
			return
		}

		const auth = getClient({credentialContent: credentials})
		const isValid = await hasValidToken(auth, JSON.parse(this.settings.tokens))

		if (!isValid) {
			// TODO if this runs twice without succeeding, that would be bad
			const [server, authorizeUrl, tokenPromise] = await getNewToken(auth)
			new Notice('Authenticate to continue. A browser window will open and authorization url is copied to clipboard.')

			navigator.clipboard.writeText(authorizeUrl)

			// open browser url in 2 seconds
			setTimeout(() => {
				opn(authorizeUrl);
			}, 2000)

			this.authorizationServer = server

			const tokens = await tokenPromise
			this.settings.tokens = JSON.stringify(tokens)
			this.saveSettings()
			new Notice('Authentication complete!')
		}

		const documentId = await findOrCreateDoc(title, folderId, auth)
		// if (await hasOpenComments(auth, documentId)) {
		// 	new Notice('Document has open comments. Please resolve them before pushing content.')
		// 	navigator.clipboard.writeText(googleDocsUrl(documentId))
		// 	return
		// }

		await updateHtml(documentId, content, auth, { wipe: true })
		navigator.clipboard.writeText(googleDocsUrl(documentId))

		new Notice('Document updated.')
	}
}

class GoogleDocSettingTab extends PluginSettingTab {
	plugin: GoogleDocsPlugin;

	constructor(app: App, plugin: GoogleDocsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Google Drive Folder ID')
			.setDesc('The ID of the Google Drive folder to push to.')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.googleDriveFolderId)
				.onChange(async (value) => {
					this.plugin.settings.googleDriveFolderId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Google Application Credentials')
			.setDesc('The credentials JSON for your Google Application.')
			.addTextArea(text => text
				.setPlaceholder('Enter the JSON')
				.setValue(this.plugin.settings.credentials)
				.onChange(async (value) => {
					this.plugin.settings.credentials = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Google Application Tokens')
			.setDesc('The token JSON for your Google Application.')
			.addTextArea(text => text
				.setPlaceholder('Enter the JSON')
				.setValue(this.plugin.settings.tokens)
				.onChange(async (value) => {
					this.plugin.settings.tokens = value;
					await this.plugin.saveSettings();
				}));
	}
}
