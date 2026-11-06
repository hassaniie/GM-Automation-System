/* Every story renders with the app's tokens and stylesheet, in the theme chosen in the toolbar. */
import '../src/styles/index.css';
import '../src/stories/catalogue.css';

export const globalTypes = {
  theme: {
    description: 'Colour theme',
    toolbar: { title: 'Theme', icon: 'mirror', items: [{ value: 'dark', title: 'Dark' }, { value: 'light', title: 'Light' }], dynamicTitle: true },
  },
};
export const initialGlobals = { theme: 'dark' };

export const decorators = [
  (Story, ctx) => {
    document.documentElement.dataset.theme = ctx.globals.theme || 'dark';
    return Story();
  },
];

export const parameters = {
  layout: 'fullscreen',
  backgrounds: { disable: true },
  options: { storySort: { order: ['Foundations', ['Colour', 'Status', 'Type', 'Spacing', 'Corners and ticks', 'Elevation', 'Motion', 'Layers'], 'Components', 'Floor'] } },
};
