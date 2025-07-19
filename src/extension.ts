// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';

// 设置项接口
interface SettingItem {
	label: string;
	key: string;
	type: 'boolean' | 'enum';
	value: any;
	description: string;
	options?: string[];
}

// TreeDataProvider for settings view
class NekoToolsSettingsProvider implements vscode.TreeDataProvider<SettingItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<SettingItem | undefined | null | void> = new vscode.EventEmitter<SettingItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<SettingItem | undefined | null | void> = this._onDidChangeTreeData.event;

	constructor() {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: SettingItem): vscode.TreeItem {
		const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
		
		if (element.type === 'boolean') {
			const isEnabled = element.value;
			item.iconPath = new vscode.ThemeIcon(isEnabled ? 'check' : 'close');
			item.description = isEnabled ? '已启用' : '已禁用';
			item.command = {
				command: 'nekotools.toggleFeature',
				title: '切换功能状态',
				arguments: [element.key]
			};
		} else {
			item.description = String(element.value);
		}
		
		item.tooltip = element.description;
		return item;
	}

	getChildren(element?: SettingItem): Thenable<SettingItem[]> {
		if (!element) {
			return Promise.resolve(this.getSettings());
		}
		return Promise.resolve([]);
	}

	private getSettings(): SettingItem[] {
		const config = vscode.workspace.getConfiguration('nekotools');
		
		return [
			{
				label: '📄 获取文件路径',
				key: 'features.getPathEnabled',
				type: 'boolean',
				value: config.get('features.getPathEnabled', true),
				description: '启用或禁用获取文件路径功能'
			},
			{
				label: '🖥️ 外部终端打开',
				key: 'features.openTerminalEnabled',
				type: 'boolean',
				value: config.get('features.openTerminalEnabled', true),
				description: '启用或禁用在外部终端中打开功能'
			},
			{
				label: '🎨 显示图标',
				key: 'path.showIcons',
				type: 'boolean',
				value: config.get('path.showIcons', true),
				description: '在路径显示中显示文件/文件夹图标'
			},
			{
				label: '📋 自动复制',
				key: 'path.autoClipboard',
				type: 'boolean',
				value: config.get('path.autoClipboard', false),
				description: '获取路径时自动复制到剪贴板'
			}
		];
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "nekotools" is now active!');

	// 创建设置视图提供者
	const settingsProvider = new NekoToolsSettingsProvider();
	vscode.window.registerTreeDataProvider('nekotools-settings', settingsProvider);

	// 注册刷新设置命令
	context.subscriptions.push(vscode.commands.registerCommand('nekotools.refreshSettings', () => {
		settingsProvider.refresh();
	}));

	// 注册切换功能状态命令
	context.subscriptions.push(vscode.commands.registerCommand('nekotools.toggleFeature', async (configKey: string) => {
		const config = vscode.workspace.getConfiguration('nekotools');
		const currentValue = config.get<boolean>(configKey, true);
		await config.update(configKey, !currentValue, vscode.ConfigurationTarget.Global);
		settingsProvider.refresh();
		vscode.window.showInformationMessage(`功能 ${configKey} 已${!currentValue ? '启用' : '禁用'}`);
	}));

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('nekotools.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from NekoTools!');
	// });

	// 注册获取当前文件路径的命令
	context.subscriptions.push(vscode.commands.registerCommand('nekotools.getCurrentFilePath', (uri) => {
		const config = vscode.workspace.getConfiguration('nekotools');
		const isEnabled = config.get<boolean>('features.getPathEnabled', false);
		
		if (!isEnabled) {
			vscode.window.showWarningMessage('获取文件路径功能已禁用，请在NekoTools设置中启用');
			return;
		}
		
		const showIcons = config.get<boolean>('path.showIcons', true);
		const autoClipboard = config.get<boolean>('path.autoClipboard', true);
		
		let filePath = '';
		let displayMessage = '';
		
		if (uri) {
			// 从资源管理器或编辑器上下文菜单调用
			filePath = uri.fsPath;
			const isDirectory = vscode.workspace.fs.stat(uri).then(stat => {
				return (stat.type & vscode.FileType.Directory) !== 0;
			});
			
			isDirectory.then(isDir => {
				if (isDir) {
					displayMessage = showIcons ? `📁 文件夹路径: ${filePath}` : `文件夹路径: ${filePath}`;
				} else {
					displayMessage = showIcons ? `📄 文件路径: ${filePath}` : `文件路径: ${filePath}`;
				}
				
				if (autoClipboard) {
					// 自动复制到剪贴板
					vscode.env.clipboard.writeText(filePath);
					vscode.window.showInformationMessage(`${displayMessage} (已复制到剪贴板)`);
				} else {
					// 显示信息并提供复制选项
					vscode.window.showInformationMessage(displayMessage, '复制路径').then(selection => {
						if (selection === '复制路径') {
							vscode.env.clipboard.writeText(filePath);
							vscode.window.showInformationMessage('路径已复制到剪贴板！');
						}
					});
				}
			});
		} else {
			// 从命令面板调用，获取当前活动编辑器的文件
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				filePath = activeEditor.document.uri.fsPath;
				displayMessage = showIcons ? `📄 当前文件路径: ${filePath}` : `当前文件路径: ${filePath}`;
				
				if (autoClipboard) {
					// 自动复制到剪贴板
					vscode.env.clipboard.writeText(filePath);
					vscode.window.showInformationMessage(`${displayMessage} (已复制到剪贴板)`);
				} else {
					// 显示信息并提供复制选项
					vscode.window.showInformationMessage(displayMessage, '复制路径').then(selection => {
						if (selection === '复制路径') {
							vscode.env.clipboard.writeText(filePath);
							vscode.window.showInformationMessage('路径已复制到剪贴板！');
						}
					});
				}
			} else {
				vscode.window.showWarningMessage('没有打开的文件或选中的文件夹');
			}
		}
	}));

	// 注册在外部终端中打开的命令
	context.subscriptions.push(vscode.commands.registerCommand('nekotools.openInExternalTerminal', (uri) => {
		const config = vscode.workspace.getConfiguration('nekotools');
		const isEnabled = config.get<boolean>('features.openTerminalEnabled', false);
		
		if (!isEnabled) {
			vscode.window.showWarningMessage('外部终端打开功能已禁用，请在NekoTools设置中启用');
			return;
		}
		
		let targetPath = '';
		
		if (uri) {
			// 从资源管理器或编辑器上下文菜单调用
			targetPath = uri.fsPath;
		} else {
			// 从命令面板调用，获取当前活动编辑器的文件
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				targetPath = activeEditor.document.uri.fsPath;
			} else {
				vscode.window.showWarningMessage('没有选中的文件或文件夹');
				return;
			}
		}
		
		// 检查是否为文件，如果是文件则获取其目录
		const fileUri = uri || vscode.Uri.file(targetPath);
		vscode.workspace.fs.stat(fileUri).then(stat => {
			let terminalPath = targetPath;
			
			if ((stat.type & vscode.FileType.Directory) === 0) {
				// 是文件，获取其目录
				terminalPath = path.dirname(targetPath);
			}

			// 根据操作系统和用户配置打开外部终端
			const platform = process.platform;
			let command = '';

			if (platform === 'win32') {
				const windowsTerminal = config.get<string>('terminal.windows', 'wt');
				switch (windowsTerminal) {
					case 'wt':
						command = `wt -d "${terminalPath}"`;
						break;
					case 'cmd':
						command = `start cmd /k "cd /d "${terminalPath}""`;
						break;
					case 'powershell':
						command = `start powershell -NoExit -Command "Set-Location '${terminalPath}'"`;
						break;
					default:
						command = `wt -d "${terminalPath}" || start cmd /k "cd /d "${terminalPath}""`;
				}
			} else if (platform === 'darwin') {
				// macOS - 使用 Terminal
				command = `open -a Terminal "${terminalPath}"`;
			} else {
				// Linux - 根据用户配置选择终端
				const linuxTerminal = config.get<string>('terminal.linux', 'gnome-terminal');
				const customCommand = config.get<string>('terminal.customCommand', '');
				
				switch (linuxTerminal) {
					case 'gnome-terminal':
						command = `gnome-terminal --working-directory="${terminalPath}"`;
						break;
					case 'xterm':
						command = `xterm -e "cd '${terminalPath}'; bash"`;
						break;
					case 'konsole':
						command = `konsole --workdir "${terminalPath}"`;
						break;
					case 'custom':
						if (customCommand) {
							command = customCommand.replace('{path}', terminalPath);
						} else {
							vscode.window.showErrorMessage('请在设置中配置自定义终端命令');
							return;
						}
						break;
					default:
						command = `gnome-terminal --working-directory="${terminalPath}" || xterm -e "cd '${terminalPath}'; bash" || konsole --workdir "${terminalPath}"`;
				}
			}

			exec(command, (error) => {
				if (error) {
					vscode.window.showErrorMessage(`无法打开外部终端: ${error.message}`);
				} else {
					vscode.window.showInformationMessage(`已在外部终端中打开: ${terminalPath}`);
				}
			});
		}, (error) => {
			vscode.window.showErrorMessage('无法访问指定的路径');
		});
	}));

	//context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
