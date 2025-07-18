export interface ITheme {
  colors: {
    core: string;
    emerald: string;
    hunter: string;
    notice: string;
    balance: string;
  };
  layout: {
    topBarHeight: number;
    bottomBarHeight: number;
  };
  fonts: {
    family: {
      primary: {
        light: string;
        regular: string;
        medium: string;
        bold: string;
      };
      secondary: {
        light: string;
        regular: string;
        medium: string;
        bold: string;
      };
    };
    size: {
      smallest: string;
      small: string;
      medium: string;
      large: string;
    };
  };
}

const common = {
  colors: {
    core: '#022C33',
    emerald: '#179C65',
    hunter: '#106F48',
    notice: '#FDB366',
    balance: '#FFFFFF',
  },
  layout: {
    topBarHeight: 130,
    bottomBarHeight: 130,
  },
  fonts: {
    size: {
      smallest: '12px',
      small: '14px',
      medium: '20px',
      large: '32px',
    },
  },
};

export const lightTheme: ITheme = {
  layout: common.layout,
  fonts: {
    ...common.fonts,
    family: {
      primary: {
        light: '300',
        regular: '400',
        medium: '500',
        bold: '700',
      },
      secondary: {
        light: '300',
        regular: '400',
        medium: '500',
        bold: '700',
      },
    },
  },
  colors: { ...common.colors },
};

export const darkTheme: ITheme = {
  layout: common.layout,
  fonts: {
    ...common.fonts,
    family: {
      primary: {
        light: '300',
        regular: '400',
        medium: '500',
        bold: '700',
      },
      secondary: {
        light: '300',
        regular: '400',
        medium: '500',
        bold: '700',
      },
    },
  },
  colors: { ...common.colors },
};
