# Obsidian Freeshow Plugin

Freeshow is a free, open source presentation software (https://freeshow.app) that has an API allow control of various operations within the application can be controlled over HTTP. This plugin allows you to insert buttons into your Obsidian text which will call the API to control the selection of a show or the selection of a slide.

This means that if you are doing a presentation and using Obsidian for your notes, you can control your slides inline with your notes. No more two apps, no more having to put your notes into your presentation and no more needing a physical switcher, simply embed slide control in your notes.

## Configuration

The only thing you really need to configure is the Freeshow endpoint. This is defined in Freeshow under Settings > Connection > API. This typically defaults to port 5505 and so within the Obsidian plugin settings you would configure endpoint as: http://host:5505

You can also configure the color of the buttons and the button text for each action type.

## Definitions

Currently it supports two Freeshow operations: Select Show and Select Slide

In edit mode, use the following to indicate a control of Freeshow, in read mode these will render as buttons that can be pressed to call the relevant Freeshow API endpoint.

### Select Show

This will select a show within Freeshow as long as the name of the show within Freeshow matches the name provided.

```
=>|Show Name|
```

### Select Slide

This will select a slide within Freeshow as long as the name of the slide Group within Freeshow matches the name provided. Note also that the show must be selected.

```
=>[Slide Name]
```

