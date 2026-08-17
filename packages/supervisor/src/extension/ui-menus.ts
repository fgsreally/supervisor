import gitExtension from "./builtin/git/index.js";
import type { AnyExtensionDefinition, UiMenuDescriptor } from "./types.js";

const builtinMenusBySlug = new Map<string, readonly UiMenuDescriptor[]>(
  [gitExtension].flatMap((definition) =>
    definition.menus?.length ? [[definition.name, definition.menus] as const] : [],
  ),
);

export function serializeUiMenu(menu: UiMenuDescriptor): UiMenuDescriptor {
  return {
    id: menu.id,
    surface: menu.surface,
    label: menu.label,
    ...(menu.icon ? { icon: menu.icon } : {}),
    ...(menu.order !== undefined ? { order: menu.order } : {}),
  };
}

export function declaredMenusForSlug(
  slug: string,
  definition?: AnyExtensionDefinition,
): UiMenuDescriptor[] {
  const menus = definition?.menus ?? builtinMenusBySlug.get(slug);
  return menus ? menus.map(serializeUiMenu) : [];
}
