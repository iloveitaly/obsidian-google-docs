import { App, Editor, MarkdownView, Notice, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { findOrCreateDoc, getClient, getNewToken, hasOpenComments, hasValidToken, updateHtml } from "markdown-to-google-docs"
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

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'push-to-google-docs',
			name: 'Push to Google Docs',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const title = view.file.basename
				const markdownContents = editor.getValue()

				this.createGoogleDoc(title, markdownContents)
			}
		});

		this.addCommand({
			id: 'open-in-google-docs',
			name: 'Open in Google Docs',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const title = view.file.basename
				const markdownContents = editor.getValue()

				this.openGoogleDoc(title, markdownContents)
			}
		})

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new GoogleDocSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async getAuth() {
		if (this.authorizationServer) {
			new Notice('Already authenticating, complete authorization.')
			return
		}

		const auth = getClient({credentialContent: this.settings.credentials})
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

		return auth
	}

	async openGoogleDoc(title: string, markdownContents: string) {
		const auth = await this.getAuth()
		new Notice('Opening Google Doc...')
		const documentId = await findOrCreateDoc(title, this.settings.googleDriveFolderId, auth)
		const documentUrl = googleDocsUrl(documentId)
		opn(documentUrl)
	}

	async createGoogleDoc(title: string, content: string) {
		const auth = await this.getAuth()
		const documentId = await findOrCreateDoc(title, this.settings.googleDriveFolderId, auth)

		if (await hasOpenComments(auth, documentId)) {
			new Notice('Document has open comments. Please resolve them before pushing content.')
			navigator.clipboard.writeText(googleDocsUrl(documentId))
			return
		}

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

		// TODO this looks ugly, should make it pretty

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
