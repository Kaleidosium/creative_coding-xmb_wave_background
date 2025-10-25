# XMB Wave Background

## Description

This project recreates the iconic XMB wave animation from the PlayStation Portable (PSP) menu interface, entirely using HTML, CSS, JavaScript, and WebGL.

It started as a personal challenge: I had never used WebGL before, but I was determined to bring this nostalgic visual effect to life in the browser. After exploring several shaders and digging into examples and experiments shared online, I gradually crafted a clean and responsive implementation that blends seamlessly into both light and dark themes.

The wave reacts dynamically depending on the color scheme of the user’s system, creating a soft, immersive background. This project is not only a tribute to the PSP, but also a hands-on study of how fragment shaders and WebGL contexts can be embedded in a modern web page.

## Objectives

- Discover and understand the basics of WebGL.
- Learn how to write and integrate a GLSL shader in a real project.
- Build a standalone animated wave background using fragment shaders.
- Dynamically adapt visuals to system color schemes (light/dark).
- Make it easy to reuse or integrate into other personal projects.

## Tech Stack

![HTML5 badge](https://img.shields.io/badge/HTML5-e34f26?logo=html5&logoColor=white&style=for-the-badge)
![CSS3 badge](https://img.shields.io/badge/CSS3-1572b6?logo=css&logoColor=white&style=for-the-badge)
![JavaScript badge](https://img.shields.io/badge/JAVASCRIPT-f7df1e?logo=javascript&logoColor=black&style=for-the-badge)
![WebGL badge](https://img.shields.io/badge/WEBGL-990000?logo=webgl&logoColor=white&style=for-the-badge)

## File Description

| **FILE**     | **DESCRIPTION**                                     |
| :----------: | --------------------------------------------------- |
| `assets`     | Contains the resources required for the repository. |
| `index.html` | Main HTML structure for the project.                |
| `style.css`  | Styles and animations for the project.              |
| `script.js`  | Behavior script for interactivity.                  |
| `README.md`  | The README file you are currently reading 😉.       |

## Installation & Usage

### Installation

1. Clone this repository:
    - Open your preferred Terminal.
    - Navigate to the directory where you want to clone the repository.
    - Run the following command:

```
git clone https://github.com/fchavonet/creative_coding-xmb_wave_background.git
```

2. Open the cloned repository.

### Usage

1. Open the `index.html` file in your web browser.

You can also test the project online by clicking [here](https://fchavonet.github.io/creative_coding-xmb_wave_background/). 

<p align="center">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="./assets/images/screenshots/desktop_page_screenshot-dark.webp">
        <source media="(prefers-color-scheme: light)" srcset="./assets/images/screenshots/desktop_page_screenshot-light.webp">
        <img src="./assets/images/screenshots/desktop_page_screenshot-light.webp" alt="Screenshot">
    </picture>
</p>

## What's Next?

- Implement performance tuning (for lower-end devices).
- Create a customizable version (color, speed, wave height).

## Thanks

- Huge thanks to developers and artists who share GLSL demos and shader snippets online, especially those from [Shadertoy](https://www.shadertoy.com/). Your work was a great source of learning and inspiration.
- Shout-out to the PSP modding and retro-tech communities, this project is a little homage.

## Author(s)

**Fabien CHAVONET**
- GitHub: [@fchavonet](https://github.com/fchavonet)
