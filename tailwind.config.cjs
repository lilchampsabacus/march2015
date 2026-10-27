'use strict';
const config = {
            theme: {
                extend: {
                    colors: {
                        brand: {
                            light: '#e0f2fe',
                            DEFAULT: '#0ea5e9',
                            dark: '#0369a1',
                        }
                    },
                    animation: {
                        'gradient-x': 'gradient-x 3s linear infinite',
                        'float': 'float 6s ease-in-out infinite',
                        'fade-in-up': 'fadeInUp 0.5s ease-out forwards'
                    },
                    keyframes: {
                        'gradient-x': {
                            '0%, 100%': {
                                'background-size': '200% 200%',
                                'background-position': 'left center'
                            },
                            '50%': {
                                'background-size': '200% 200%',
                                'background-position': 'right center'
                            }
                        },
                        'float': {
                            '0%, 100%': { transform: 'translateY(0)' },
                            '50%': { transform: 'translateY(-20px)' }
                        },
                        'fadeInUp': {
                            '0%': { opacity: '0', transform: 'translateY(10px)' },
                            '100%': { opacity: '1', transform: 'translateY(0)' }
                        }
                    }
                }
            }
        };
config.content = ['./*.html', './*.js', './live/*.html', './live/*.js'];
// Progress observations choose these colours at runtime.
config.safelist = ['blue', 'green', 'amber', 'red'].flatMap(color => [
  `bg-${color}-50`, `border-${color}-200`
]);
module.exports = config;
