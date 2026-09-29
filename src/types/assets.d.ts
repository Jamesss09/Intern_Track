/**
 * Static image imports.
 *
 * `expo/types` declares Expo's own modules but no asset extensions, and Metro
 * resolves `require('./x.png')` to a numeric asset handle at runtime. So
 * `import icon from '../../assets/icon.png'` typechecks against nothing until
 * this is declared. → [[Decisions#D-011 — Verify every Expo API against the installed SDK]]
 *
 * `ImageSourcePropType` is what `<Image source>` accepts, so the declaration
 * cannot drift from the prop it is passed to.
 */
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const content: ImageSourcePropType;
  export default content;
}

declare module '*.jpg' {
  import type { ImageSourcePropType } from 'react-native';

  const content: ImageSourcePropType;
  export default content;
}

declare module '*.jpeg' {
  import type { ImageSourcePropType } from 'react-native';

  const content: ImageSourcePropType;
  export default content;
}
