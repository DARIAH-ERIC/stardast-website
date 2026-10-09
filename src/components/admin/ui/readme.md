# Admin ui components

These components started as copies of [Intent UI](https://intentui.com) components, taken from its registry
(`https://intentui.com/r/<name>.json`) on 2026-10-12. They are not kept in sync with upstream: they are our own code, and
follow the project's conventions.

Changes made when copying them:

- imports use `#/` paths with file extensions
- icons come from `lucide-react` instead of `@heroicons/react`
- `twMerge` from `tailwind-merge` replaces the `cn` package
- formatted with oxfmt, and linted with oxlint like the rest of the project - e.g. explicit return types, explicit
  conditionals, and logical instead of physical tailwind classes
- broken class names in upstream fixed, e.g. truncated arbitrary values in `tree.tsx` and `keyboard.tsx`
- css that registry items ship besides their components - only `sheet` has any - is in `src/styles/admin.css`

To use an improvement from upstream, port it by hand rather than copying the upstream file over ours. A component that
is not here yet can be copied from the registry in the same way; colour tokens are defined in `src/styles/admin.css`.
