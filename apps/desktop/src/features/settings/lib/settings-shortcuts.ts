import {
  getCurrentGrimPlatform,
  grimKeybindings,
  type GrimCommandId,
  type GrimPlatform,
} from '@/shared/lib/keybindings';

type TranslateFunction = (key: string, options: { defaultValue: string }) => string;

type SettingsShortcutSectionDefinition = {
  id: SettingsShortcutSectionId;
  titleKey: string;
  titleDefault: string;
};

type SettingsShortcutNameKey = `settings.shortcuts.command.${string}`;

export type SettingsTab = 'general' | 'shortcuts';

export type SettingsShortcutSectionId =
  | 'global'
  | 'library'
  | 'explorer'
  | 'references'
  | 'records'
  | 'tags'
  | 'presets'
  | 'croquis'
  | 'capture'
  | 'modal';

export type SettingsShortcutMetadata = {
  section: SettingsShortcutSectionId;
  nameKey: SettingsShortcutNameKey;
  nameDefault: string;
  order: number;
};

export type SettingsShortcutItem = {
  command: GrimCommandId;
  description: string;
  keyParts: readonly string[];
  name: string;
  order: number;
};

export type SettingsShortcutSection = {
  id: SettingsShortcutSectionId;
  title: string;
  items: readonly SettingsShortcutItem[];
};

const SETTINGS_SHORTCUT_SECTION_DEFINITIONS: readonly SettingsShortcutSectionDefinition[] = [
  { id: 'global', titleKey: 'settings.shortcuts.section.global', titleDefault: 'Global' },
  { id: 'library', titleKey: 'settings.shortcuts.section.library', titleDefault: 'Library' },
  { id: 'explorer', titleKey: 'settings.shortcuts.section.explorer', titleDefault: 'Explorer' },
  {
    id: 'references',
    titleKey: 'settings.shortcuts.section.references',
    titleDefault: 'References',
  },
  { id: 'records', titleKey: 'settings.shortcuts.section.records', titleDefault: 'Records' },
  { id: 'tags', titleKey: 'settings.shortcuts.section.tags', titleDefault: 'Tags' },
  { id: 'presets', titleKey: 'settings.shortcuts.section.presets', titleDefault: 'Presets' },
  { id: 'croquis', titleKey: 'settings.shortcuts.section.croquis', titleDefault: 'Croquis' },
  { id: 'capture', titleKey: 'settings.shortcuts.section.capture', titleDefault: 'Capture' },
  {
    id: 'modal',
    titleKey: 'settings.shortcuts.section.modal',
    titleDefault: 'Modal / Forms',
  },
];

const SETTINGS_SHORTCUT_METADATA = {
  'grim.settings.open': metadata(
    'global',
    'settings.shortcuts.command.settings_open',
    'Open settings',
    10,
  ),
  'grim.sidebar.toggle': metadata(
    'library',
    'settings.shortcuts.command.sidebar_toggle',
    'Toggle sidebar',
    10,
  ),
  'grim.view.references': metadata(
    'library',
    'settings.shortcuts.command.view_references',
    'Open References view',
    20,
  ),
  'grim.view.records': metadata(
    'library',
    'settings.shortcuts.command.view_records',
    'Open Records view',
    30,
  ),
  'grim.view.tags': metadata(
    'library',
    'settings.shortcuts.command.view_tags',
    'Open Tags view',
    40,
  ),
  'grim.view.presets': metadata(
    'library',
    'settings.shortcuts.command.view_presets',
    'Open Presets view',
    50,
  ),
  'grim.currentView.filter.toggle': metadata(
    'library',
    'settings.shortcuts.command.current_view_filter_toggle',
    'Toggle current view filter',
    60,
  ),
  'grim.currentView.refresh': metadata(
    'library',
    'settings.shortcuts.command.current_view_refresh',
    'Refresh current view',
    70,
  ),
  'grim.explorer.focus': metadata(
    'library',
    'settings.shortcuts.command.explorer_focus',
    'Focus explorer',
    80,
  ),
  'grim.explorer.import.open': metadata(
    'explorer',
    'settings.shortcuts.command.explorer_import_open',
    'Open import dialog',
    10,
  ),
  'grim.explorer.folder.new': metadata(
    'explorer',
    'settings.shortcuts.command.explorer_folder_new',
    'Create folder',
    20,
  ),
  'grim.explorer.node.rename': metadata(
    'explorer',
    'settings.shortcuts.command.explorer_node_rename',
    'Rename selected folder',
    30,
  ),
  'grim.explorer.node.delete': metadata(
    'explorer',
    'settings.shortcuts.command.explorer_node_delete',
    'Delete selected folder',
    40,
  ),
  'grim.explorer.node.expand': metadata(
    'explorer',
    'settings.shortcuts.command.explorer_node_expand',
    'Expand selected folder',
    50,
  ),
  'grim.explorer.node.collapse': metadata(
    'explorer',
    'settings.shortcuts.command.explorer_node_collapse',
    'Collapse selected folder',
    60,
  ),
  'grim.explorer.node.open': metadata(
    'explorer',
    'settings.shortcuts.command.explorer_node_open',
    'Open selected folder',
    70,
  ),
  'grim.references.preview.open': metadata(
    'references',
    'settings.shortcuts.command.references_preview_open',
    'Open reference preview',
    10,
  ),
  'grim.references.preview.close': metadata(
    'references',
    'settings.shortcuts.command.references_preview_close',
    'Close reference preview',
    20,
  ),
  'grim.references.selection.toggleMode': metadata(
    'references',
    'settings.shortcuts.command.references_selection_toggle_mode',
    'Toggle reference selection mode',
    30,
  ),
  'grim.references.selection.toggleItem': metadata(
    'references',
    'settings.shortcuts.command.references_selection_toggle_item',
    'Toggle focused reference selection',
    40,
  ),
  'grim.references.selection.selectAll': metadata(
    'references',
    'settings.shortcuts.command.references_selection_select_all',
    'Select all references',
    50,
  ),
  'grim.references.selection.clear': metadata(
    'references',
    'settings.shortcuts.command.references_selection_clear',
    'Clear reference selection',
    60,
  ),
  'grim.references.clipboard.paste': metadata(
    'references',
    'settings.shortcuts.command.references_clipboard_paste',
    'Paste references from clipboard',
    70,
  ),
  'grim.references.folder.add': metadata(
    'references',
    'settings.shortcuts.command.references_folder_add',
    'Add selected references to folder',
    80,
  ),
  'grim.references.folder.move': metadata(
    'references',
    'settings.shortcuts.command.references_folder_move',
    'Move selected references to folder',
    90,
  ),
  'grim.references.croquis.start': metadata(
    'references',
    'settings.shortcuts.command.references_croquis_start',
    'Start croquis with selected references',
    100,
  ),
  'grim.references.layout.toggle': metadata(
    'references',
    'settings.shortcuts.command.references_layout_toggle',
    'Toggle reference layout',
    110,
  ),
  'grim.records.preview.open': metadata(
    'records',
    'settings.shortcuts.command.records_preview_open',
    'Open record preview',
    10,
  ),
  'grim.records.preview.close': metadata(
    'records',
    'settings.shortcuts.command.records_preview_close',
    'Close record preview',
    20,
  ),
  'grim.records.selection.toggleMode': metadata(
    'records',
    'settings.shortcuts.command.records_selection_toggle_mode',
    'Toggle record selection mode',
    30,
  ),
  'grim.records.selection.toggleItem': metadata(
    'records',
    'settings.shortcuts.command.records_selection_toggle_item',
    'Toggle focused record selection',
    40,
  ),
  'grim.records.selection.selectAll': metadata(
    'records',
    'settings.shortcuts.command.records_selection_select_all',
    'Select all records',
    50,
  ),
  'grim.records.selection.clear': metadata(
    'records',
    'settings.shortcuts.command.records_selection_clear',
    'Clear record selection',
    60,
  ),
  'grim.records.tags.add': metadata(
    'records',
    'settings.shortcuts.command.records_tags_add',
    'Add tags to selected records',
    70,
  ),
  'grim.records.export.open': metadata(
    'records',
    'settings.shortcuts.command.records_export_open',
    'Open record export',
    80,
  ),
  'grim.records.deleteSelected': metadata(
    'records',
    'settings.shortcuts.command.records_delete_selected',
    'Delete selected records',
    90,
  ),
  'grim.records.layout.toggle': metadata(
    'records',
    'settings.shortcuts.command.records_layout_toggle',
    'Toggle record layout',
    100,
  ),
  'grim.tags.group.new': metadata(
    'tags',
    'settings.shortcuts.command.tags_group_new',
    'Create tag group',
    10,
  ),
  'grim.tags.tag.new': metadata(
    'tags',
    'settings.shortcuts.command.tags_tag_new',
    'Create tag in selected group',
    20,
  ),
  'grim.tags.save': metadata(
    'tags',
    'settings.shortcuts.command.tags_save',
    'Save tag settings',
    30,
  ),
  'grim.tags.rename': metadata(
    'tags',
    'settings.shortcuts.command.tags_rename',
    'Rename selected tag item',
    40,
  ),
  'grim.tags.delete': metadata(
    'tags',
    'settings.shortcuts.command.tags_delete',
    'Delete selected tag item',
    50,
  ),
  'grim.tags.cancelEdit': metadata(
    'tags',
    'settings.shortcuts.command.tags_cancel_edit',
    'Cancel tag edit',
    60,
  ),
  'grim.tags.commitEdit': metadata(
    'tags',
    'settings.shortcuts.command.tags_commit_edit',
    'Commit tag edit',
    70,
  ),
  'grim.presets.session.new': metadata(
    'presets',
    'settings.shortcuts.command.presets_session_new',
    'Create session preset',
    10,
  ),
  'grim.presets.timeStep.new': metadata(
    'presets',
    'settings.shortcuts.command.presets_time_step_new',
    'Create time step preset',
    20,
  ),
  'grim.presets.save': metadata(
    'presets',
    'settings.shortcuts.command.presets_save',
    'Save preset settings',
    30,
  ),
  'grim.presets.rename': metadata(
    'presets',
    'settings.shortcuts.command.presets_rename',
    'Rename selected preset item',
    40,
  ),
  'grim.presets.delete': metadata(
    'presets',
    'settings.shortcuts.command.presets_delete',
    'Delete selected preset item',
    50,
  ),
  'grim.presets.step.add': metadata(
    'presets',
    'settings.shortcuts.command.presets_step_add',
    'Add preset step',
    60,
  ),
  'grim.presets.cancelEdit': metadata(
    'presets',
    'settings.shortcuts.command.presets_cancel_edit',
    'Cancel preset edit',
    70,
  ),
  'grim.presets.commitEdit': metadata(
    'presets',
    'settings.shortcuts.command.presets_commit_edit',
    'Commit preset edit',
    80,
  ),
  'grim.croquis.playback.toggle': metadata(
    'croquis',
    'settings.shortcuts.command.croquis_playback_toggle',
    'Play or pause croquis',
    10,
  ),
  'grim.croquis.previous': metadata(
    'croquis',
    'settings.shortcuts.command.croquis_previous',
    'Go to previous croquis image',
    20,
  ),
  'grim.croquis.next': metadata(
    'croquis',
    'settings.shortcuts.command.croquis_next',
    'Go to next croquis image',
    30,
  ),
  'grim.croquis.saveRecord': metadata(
    'croquis',
    'settings.shortcuts.command.croquis_save_record',
    'Save current croquis record',
    40,
  ),
  'grim.croquis.capture': metadata(
    'croquis',
    'settings.shortcuts.command.croquis_capture',
    'Capture croquis preview',
    50,
  ),
  'grim.croquis.copyImage': metadata(
    'croquis',
    'settings.shortcuts.command.croquis_copy_image',
    'Copy croquis image',
    60,
  ),
  'grim.croquis.quickAction.close': metadata(
    'croquis',
    'settings.shortcuts.command.croquis_quick_action_close',
    'Close quick action menu',
    70,
  ),
  'grim.croquis.window.close': metadata(
    'croquis',
    'settings.shortcuts.command.croquis_window_close',
    'Close croquis window',
    80,
  ),
  'grim.capture.cancel': metadata(
    'capture',
    'settings.shortcuts.command.capture_cancel',
    'Cancel capture',
    10,
  ),
  'grim.capture.confirm': metadata(
    'capture',
    'settings.shortcuts.command.capture_confirm',
    'Confirm capture',
    20,
  ),
  'grim.capture.resetSelection': metadata(
    'capture',
    'settings.shortcuts.command.capture_reset_selection',
    'Reset capture selection',
    30,
  ),
  'grim.capture.copyPreview': metadata(
    'capture',
    'settings.shortcuts.command.capture_copy_preview',
    'Copy capture preview',
    40,
  ),
  'grim.modal.close': metadata(
    'modal',
    'settings.shortcuts.command.modal_close',
    'Close modal',
    10,
  ),
  'grim.form.submit': metadata(
    'modal',
    'settings.shortcuts.command.form_submit',
    'Submit form',
    20,
  ),
  'grim.form.save': metadata('modal', 'settings.shortcuts.command.form_save', 'Save form', 30),
  'grim.form.cancel': metadata(
    'modal',
    'settings.shortcuts.command.form_cancel',
    'Cancel form changes',
    40,
  ),
  'grim.focus.next': metadata(
    'modal',
    'settings.shortcuts.command.focus_next',
    'Focus next control',
    50,
  ),
  'grim.focus.previous': metadata(
    'modal',
    'settings.shortcuts.command.focus_previous',
    'Focus previous control',
    60,
  ),
} satisfies Record<GrimCommandId, SettingsShortcutMetadata>;

const NON_MODIFIER_KEY_LABELS: Readonly<Record<string, string>> = {
  ',': ',',
  '.': '.',
  '/': '/',
  ';': ';',
  '[': '[',
  ']': ']',
  '\\': '\\',
  '-': '-',
  '=': '=',
  '`': '`',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  backspace: 'Backspace',
  delete: 'Delete',
  end: 'End',
  enter: 'Enter',
  escape: 'Esc',
  home: 'Home',
  pagedown: 'Page Down',
  pageup: 'Page Up',
  space: 'Space',
  tab: 'Tab',
};

function metadata(
  section: SettingsShortcutSectionId,
  nameKey: SettingsShortcutNameKey,
  nameDefault: string,
  order: number,
): SettingsShortcutMetadata {
  return { section, nameKey, nameDefault, order };
}

export function getSettingsShortcutPlatform(): GrimPlatform {
  return getCurrentGrimPlatform();
}

export function createSettingsShortcutSections(
  translate: TranslateFunction,
  platform: GrimPlatform,
): readonly SettingsShortcutSection[] {
  const sectionBuckets = new Map<SettingsShortcutSectionId, SettingsShortcutItem[]>();

  SETTINGS_SHORTCUT_SECTION_DEFINITIONS.forEach(section => {
    sectionBuckets.set(section.id, []);
  });

  grimKeybindings.forEach((binding, bindingIndex) => {
    const bindingMetadata = SETTINGS_SHORTCUT_METADATA[binding.command];
    const sectionTitle = getSectionTitle(translate, bindingMetadata.section);
    const sectionItems = sectionBuckets.get(bindingMetadata.section);

    sectionItems?.push({
      command: binding.command,
      description: sectionTitle,
      keyParts: formatShortcutKeyParts(binding.key[platform], platform),
      name: translate(bindingMetadata.nameKey, {
        defaultValue: bindingMetadata.nameDefault,
      }),
      order: bindingMetadata.order + bindingIndex / 1000,
    });
  });

  return SETTINGS_SHORTCUT_SECTION_DEFINITIONS.map(section => ({
    id: section.id,
    title: getSectionTitle(translate, section.id),
    items: [...(sectionBuckets.get(section.id) ?? [])].sort(
      (left, right) => left.order - right.order,
    ),
  })).filter(section => section.items.length > 0);
}

function getSectionTitle(
  translate: TranslateFunction,
  sectionId: SettingsShortcutSectionId,
): string {
  const section = SETTINGS_SHORTCUT_SECTION_DEFINITIONS.find(({ id }) => id === sectionId);

  if (!section) {
    return sectionId;
  }

  return translate(section.titleKey, { defaultValue: section.titleDefault });
}

function formatShortcutKeyParts(key: string, platform: GrimPlatform): readonly string[] {
  return key.split('+').map(part => formatShortcutKeyPart(part, platform));
}

function formatShortcutKeyPart(part: string, platform: GrimPlatform): string {
  const normalizedPart = part.trim().toLowerCase();

  switch (normalizedPart) {
    case 'meta':
      return platform === 'mac' ? '⌘' : 'Win';
    case 'shift':
      return platform === 'mac' ? '⇧' : 'Shift';
    case 'alt':
      return platform === 'mac' ? '⌥' : 'Alt';
    case 'ctrl':
      return 'Ctrl';
    default:
      break;
  }

  const label = NON_MODIFIER_KEY_LABELS[normalizedPart];
  if (label) {
    return label;
  }

  if (/^f\d{1,2}$/.test(normalizedPart)) {
    return normalizedPart.toUpperCase();
  }

  if (normalizedPart.length === 1) {
    return normalizedPart.toUpperCase();
  }

  return normalizedPart.replace(/(^|\s)\S/g, value => value.toUpperCase());
}
