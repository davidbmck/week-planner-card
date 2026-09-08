# Week Planner Card

[![GitHub release](https://img.shields.io/github/v/release/davidbmck/week-planner-card)](https://github.com/davidbmck/week-planner-card/releases/latest)
[![Validate Build](https://github.com/davidbmck/week-planner-card/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/davidbmck/week-planner-card/actions/workflows/build.yml)
[![Licence](https://img.shields.io/github/license/davidbmck/week-planner-card)](LICENSE)

A custom Home Assistant card showing a responsive overview of calendar entities, todo-list entities with due dates, and optional weather forecasts.

![Example Week Planner Cards](examples/card.png)

## Contents

- [About this fork](#about-this-fork)
- [Installation](#installation)
- [Configuration](#configuration)
- [Calendars and todo lists](#calendars-and-todo-lists)
- [Actions](#actions)
- [Weather](#weather)
- [Columns](#columns)
- [Multi-day mode](#multi-day-mode)
- [Styling](#styling)
- [Examples](#examples)
- [Credits / lineage](#credits--lineage)

## About this fork

This is an independent maintained fork of [FamousWolf/week-planner-card](https://github.com/FamousWolf/week-planner-card), originally created by Rudy Gnodde. It is not an official continuation or replacement for the original project.

This fork started from [bentemple/week-planner-card](https://github.com/bentemple/week-planner-card) v1.15.1. Benjamin Temple's fork added todo-list support in v1.15.0 and the Home Assistant 2026 event-dialog header compatibility fix in v1.15.1. Our v1.15.2 baseline deliberately introduced no runtime behaviour changes; it established this fork's independent build, release and installation path.

The maintenance direction is to:

- Keep the card compatible with current Home Assistant frontend changes.
- Improve long-running reliability, especially on wall and kiosk dashboards, so refresh, network and weather failures recover automatically instead of leaving the card stuck.
- Preserve existing `custom:week-planner-card` YAML compatibility wherever practical.
- Make focused, reviewable changes rather than a wholesale rewrite.
- Improve fixed-layout and kiosk behaviour, including opt-in bounded-height handling.
- Accept sensible compatibility and maintenance improvements that fit these goals.

Weather independence ([#2](https://github.com/davidbmck/week-planner-card/issues/2)) and async calendar scheduling ([#3](https://github.com/davidbmck/week-planner-card/issues/3)) are addressed in the current source. Further reliability work is tracked in [refresh failure recovery (#4)](https://github.com/davidbmck/week-planner-card/issues/4) and [browser/connection lifecycle (#5)](https://github.com/davidbmck/week-planner-card/issues/5). [Bounded-height layouts (#6)](https://github.com/davidbmck/week-planner-card/issues/6) are also planned. These are follow-on improvements, not features delivered by the v1.15.2 baseline; see [releases](https://github.com/davidbmck/week-planner-card/releases) for published versions.

## Installation

### HACS custom repository

This fork is not currently in the default HACS repository list. With [HACS](https://hacs.xyz) installed:

1. Open HACS.
2. Select the three-dot menu → **Custom repositories**.
3. Enter `https://github.com/davidbmck/week-planner-card`.
4. Select repository type **Dashboard**, then **Add**.
5. Find **Week Planner Card** from this repository and download/install it.
6. Refresh the Home Assistant/browser frontend as required.

See [HACS custom repository instructions](https://hacs.xyz/docs/faq/custom_repositories/) for the general process.

This fork retains the upstream filename `week-planner-card.js` and custom element `week-planner-card`, used in YAML as `custom:week-planner-card`. When moving from upstream, replace the old installation/resource rather than installing both variants side-by-side. Existing card YAML is intended to remain compatible.

### Manual installation

1. Download **`week-planner-card.js`** from [this fork's latest GitHub release](https://github.com/davidbmck/week-planner-card/releases/latest). Use the built release asset, not a source archive.
2. Place the file in `config/www`.
3. In Home Assistant, open **Settings → Dashboards → three-dot menu → Resources**. Enable Advanced Mode in your user profile if Resources is not visible.
4. Add resource URL **`/local/week-planner-card.js`**, with type **JavaScript module**.
5. Refresh the frontend/browser. When updating an existing installation, replace the file and refresh; use a hard refresh if the browser still has an older copy cached.

A full Home Assistant restart is not needed merely to reload an updated dashboard resource. If you are creating `www` for the first time, Home Assistant's [resource registration guide](https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources/) describes the initial setup step separately.

### Resources managed in YAML

The UI method above is preferred for UI-managed resources. If you manage resources in YAML, merge this into the existing `lovelace:` section of `configuration.yaml`:

```yaml
lovelace:
  resource_mode: yaml
  resources:
    - url: /local/week-planner-card.js
      type: module
```

`resource_mode: yaml` is required for YAML resources to be used. Use **Reload resources** or the `lovelace.reload_resources` action after changing the resource list, then refresh the frontend. See [Home Assistant's YAML resource documentation](https://www.home-assistant.io/dashboards/dashboards/#adding-yaml-dashboards).

## Configuration

Add a custom card through the dashboard editor or paste a card example below into its YAML editor. Replace example entity IDs with your own. The tables describe current runtime defaults when a key is omitted; the visual editor's initial card template can explicitly populate some values.

### Main options

| Key | Type | Default | Behaviour |
| --- | --- | --- | --- |
| `type` | string | Required | `custom:week-planner-card`. |
| `calendars` | list of objects | Required | Calendar and todo entities; see [Calendars and todo lists](#calendars-and-todo-lists). |
| `title` | string | None | Optional card title. |
| `days` | integer or string | `7` | Positive number of days, or `month`; see [Month view](#month-view). |
| `startingDay` | string | `today` | `today`, `tomorrow`, `yesterday`, `month`, or an English weekday name (`monday` through `sunday`). For a numeric day range, a weekday selects its most recent occurrence, including today. |
| `startingDayOffset` | integer | `0` | Add/subtract days from the start; ignored for `days: month` with a weekday start. |
| `showWeekDayText` | boolean | `true` | Show weekday text in each day's heading, with Today/Tomorrow/Yesterday substitutions. If false, a separate weekday header row is used for views of at least seven days or month-style views. Shorter views still show text in each day. `dayFormat` overrides the individual heading. |
| `hideWeekend` | boolean | `false` | Omit Saturday and Sunday, without adding replacement days to the range. |
| `hideDaysWithoutEvents` | boolean | `false` | Omit days with no events, except today; see the note below. |
| `hideTodayWithoutEvents` | boolean | `false` | Also omit an empty today when `hideDaysWithoutEvents` is true. |
| `showNavigation` | boolean | `false` | Previous, reset and next controls. Move by the configured day count, or by months for `days: month`. |
| `maxEvents` | integer | Unlimited (`0`) | Limit events across the view; reaching the limit can also shorten the displayed day range. |
| `maxDayEvents` | integer | Unlimited (`0`) | Limit visible events per day and show `texts.moreEvents` when more exist. |
| `updateInterval` | number | `60` | Seconds from a completed refresh until the next calendar/todo refresh is scheduled. |
| `noCardBackground` | boolean | `false` | Remove the card background, border and shadow. |
| `eventBackground` | CSS colour | `var(--card-background-color, inherit)` | Event background. |
| `compact` | boolean | `false` | Reduce spacing and font sizes; also affects default [column counts](#columns). |
| `showTitle` | boolean | `true` | Show event titles in the overview; also controls visibility of todo checkboxes. |
| `showDescription` | boolean | `false` | Show descriptions in the overview. |
| `showLocation` | boolean | `false` | Show locations in the overview. |
| `hidePastEvents` | boolean | `false` | Omit calendar events whose end is past, and todo items whose due date/time is past. |
| `hideAllDayEvents` | boolean | `false` | Omit all-day entries, including full middle-day segments of multi-day events. |
| `combineSimilarEvents` | boolean | `false` | Combine entries with the same displayed title and start/end date-time across entities. |
| `showLegend` | boolean | `false` | Show calendar/todo names and colours/icons. |
| `legendToggle` | boolean | `false` | Allow clicking legend entries to hide/show their events; use with `showLegend: true`. |
| `locationLink` | URL prefix | `https://www.google.com/maps/search/?api=1&query=` | Prefix for the location link in calendar event details. |
| `filter` | regex string | Disabled | Omit events whose original `summary` matches; applies in addition to each entity's filter. |
| `filterText` | regex string | Disabled | Remove the first matching text from the displayed title. |
| `replaceTitleText` | object | Disabled | Literal title replacements; see [Title filtering and replacement](#title-filtering-and-replacement). |
| `texts` | object | Built-in labels | Override labels; see [Texts](#texts). |
| `actions` | object | Disabled | Card tap behaviour; see [Actions](#actions). |
| `weather` | object or entity string | Disabled | Optional [Weather](#weather) forecast. |
| `columns` | object | Responsive | Override [Columns](#columns) by card width. |
| `multiDayMode` | string | `default` | `default`, `single` or `multiple`; see [Multi-day mode](#multi-day-mode). |

Empty-day detection uses the day's event list before legend/`initiallyHidden` visibility filtering. Hiding a calendar does not necessarily remove its otherwise-empty day. Blank outside-month alignment cells are also retained.

### Date formats and locale

Formats use [Luxon format tokens](https://moment.github.io/luxon/#/formatting?id=table-of-tokens).

| Key | Type | Default | Behaviour |
| --- | --- | --- | --- |
| `dayFormat` | string | Unset | Replace the individual date heading. Formatted output is rendered as HTML; quote literal markup using Luxon's format syntax. |
| `dateFormat` | string | `cccc d LLLL yyyy` | Date format in calendar event details. |
| `timeFormat` | string | `HH:mm` | Time format for ordinary event times and calendar details. |
| `multiDayTimeFormat` | string | Fallback `d LLL HH:mm` | Intended public format for multi-day times in `single`/`multiple` modes; currently ignored, as described below. |
| `locale` | string | Luxon/environment default | A non-empty value sets Luxon's default locale for date/day/month formatting. If omitted, the card leaves that default unchanged; it normally follows the browser/system locale, or a default already set by another card using the same Luxon instance. The editor's initial template explicitly supplies `en`. |

**Known limitation:** `multiDayTimeFormat` is exposed in the editor but currently ignored because `setConfig()` reads `config._multiDayTimeFormat`. The fallback is `d LLL HH:mm`. This is tracked in [configuration lookup bug #9](https://github.com/davidbmck/week-planner-card/issues/9); this documentation does not change runtime behaviour.

### Texts

`texts` is an object, not a list. Locale affects weekday/month names, but does not automatically translate the fixed English labels below.

| Key | Default | Meaning |
| --- | --- | --- |
| `fullDay` | `Entire day` | Label instead of the time for an all-day entry. |
| `noEvents` | `No events` | Label for a displayed day with no visible entries. |
| `moreEvents` | `More events` | Label when `maxDayEvents` hides extra entries; not an event count. |
| `today` | `Today` | Heading text for today. |
| `tomorrow` | `Tomorrow` | Heading text for tomorrow. |
| `yesterday` | `Yesterday` | Heading text for yesterday. |
| `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday` | Localized long weekday name | Override each weekday's label. |

All overrides are strings. Empty strings for `today`, `tomorrow` and `yesterday` make those headings use weekday names instead.

### Month view

For the entire current month, use `days: month` with `startingDay: month`. With `days: month` and a weekday start such as `monday`, the month is aligned to that weekday and cells outside the target month remain as blank alignment cells, without events or weather. They are not simply removed. In this weekday-aligned mode, `startingDayOffset` is ignored.

`days: month` alone uses the month's day count from the configured start; it does not by itself force the first of the month. Use seven columns at every width when you want a fixed seven-day grid and a separate weekday header row.

## Calendars and todo lists

Calendar and todo requests run concurrently. Once all requests settle, the card updates and schedules one refresh after `updateInterval` seconds, without polling for completion. Requests that never settle can still block later calendar refreshes; timeout and failure recovery are tracked in [#4](https://github.com/davidbmck/week-planner-card/issues/4).

Each entry under `calendars` must be an object with an `entity` key, whether it refers to `calendar.*` or `todo.*`.

| Key | Type | Default | Behaviour |
| --- | --- | --- | --- |
| `entity` | string | Required | A `calendar.*` or `todo.*` entity ID. |
| `name` | string | Entity ID in legend | Override the legend/details name. Details otherwise use the entity's friendly name. |
| `color` | CSS colour | `inherit` | Event border and legend colour. Quote hex colours in YAML. |
| `icon` | string | None | Icon for entries and legend, such as `mdi:calendar`. |
| `eventTitleField` | string | `summary` | Source field used as the displayed title. |
| `filter` | regex string | Disabled | Omit entries whose original `summary` matches. |
| `filterText` | regex string | Disabled | Remove the first matching text from the displayed title. |
| `replaceTitleText` | object | Disabled | Literal title replacements. |
| `hideInLegend` | boolean | `false` | Omit this entity from the legend. |
| `initiallyHidden` | boolean | `false` | Initially hide entries from this entity; enable the legend and its toggle to reveal them. |
| `sorting` | number | Entity list position | Advanced YAML-only tie-breaker for equal start times; larger values sort first. The current code treats `0` as unset and falls back to list position. |

### Todo behaviour

- Only todo items with valid due dates are displayed; undated items are omitted.
- Timed due dates appear at their time, and date-only due dates appear as all-day. The inherited implementation also treats a due time of `00:00` as all-day.
- A checkbox toggles the item's `completed` / `needs_action` state through Home Assistant.
- Completed titles display struck through.
- Todo items do not open the event-details dialog. The checkbox is shown with the title, so keep `showTitle: true` to use it.

### Title filtering and replacement

`filter` decides whether to omit the whole entry by matching its original `summary`, even if `eventTitleField` selects a different displayed field. For the displayed title, processing order is: select the title field, apply the entity's `filterText`, apply the card's `filterText`, apply entity replacements, then card replacements.

`filterText` removes the first regex match. `replaceTitleText` maps literal search strings to replacement strings and replaces the first occurrence of each, in mapping order. It is available at card and entity level through YAML, not in the visual editor. See the [replacement example](#replace-title-text).

## Actions

Without `actions`, clicking a calendar event opens its details. Clicking weather opens that entity's more-info dialog, and todo checkboxes update completion.

Only a card-level tap action is supported. Put Home Assistant's `tap_action` configuration inside `actions`; see [dashboard action syntax](https://www.home-assistant.io/dashboards/actions/). Configuring `actions` replaces calendar-event detail clicks with the card tap action. Weather and checkbox clicks retain their own behaviour. Hold and double-tap actions are not supported.

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
actions:
  tap_action:
    action: navigate
    navigation_path: /lovelace/calendar
```

Replace the navigation path with a dashboard/view that exists in your installation.

## Weather

Forecast coverage depends on the weather entity; requesting 21 planner days does not create a 21-day forecast. The card subscribes to daily forecasts by default. Clicking the displayed forecast opens the weather entity's more-info dialog.

In the current source, weather subscription setup failures and missing forecast events do not block calendar refresh. Received forecasts update the display immediately when calendar loading is idle, or when an in-progress calendar refresh completes.

`weather` accepts an entity string shorthand (condition icon only by default):

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
weather: weather.my_weather_service
```

Or use an object with these keys:

| Key | Type | Default | Behaviour |
| --- | --- | --- | --- |
| `entity` | string | Required when using weather | Weather entity ID. |
| `showCondition` | boolean | `true` | Show the forecast condition icon. |
| `showTemperature` | boolean | `false` | Show forecast temperature. |
| `showLowTemperature` | boolean | `false` | Show forecast low temperature when supplied. |
| `roundTemperature` | boolean | `false` | Round displayed forecast temperatures to the nearest integer. |
| `useTwiceDaily` | boolean | `false` | Explicitly request `twice_daily` instead of `daily`; nighttime entries are ignored. This is a manual choice, not automatic fallback if daily forecasts fail. |

The initial editor template includes these defaults. For an existing configuration that omits `showCondition`, its editor switch can appear off even though the runtime default is true.

## Columns

Column counts follow the card's CSS container width, not the browser window width. Set positive integers in the `columns` object to override each range. These are the actual CSS ranges; the visual editor's breakpoint labels do not accurately describe the boundaries.

| Key | Card container width | Default | Default with `compact: true` |
| --- | --- | --- | --- |
| `extraLarge` | Greater than 1920 px | 7 | 7 |
| `large` | Greater than 1280 px, up to 1920 px | 7 | 7 |
| `medium` | Greater than 1024 px, up to 1280 px | 5 | 7 |
| `small` | Greater than 640 px, up to 1024 px | 3 | 4 |
| `extraSmall` | Up to 640 px | 1 | 2 |

Override all five keys to keep a constant column count; see the [kiosk example](#fixed-seven-column-kiosk-layout).

## Multi-day mode

`multiDayMode` controls how events spanning days are displayed:

| Value | Behaviour |
| --- | --- |
| `default` | Split across days. The first segment starts at the event's start time; the last ends at its end time. Full middle-day segments use the all-day label. |
| `single` | Show only the first segment on or after the view's start date, using the original start and end with the multi-day time format. |
| `multiple` | Show each day's segment, using the original start and end with the multi-day time format on each entry. |

The current multi-day format fallback is `d LLL HH:mm`; the intended `multiDayTimeFormat` override is affected by [#9](https://github.com/davidbmck/week-planner-card/issues/9). In `single` mode, the first segment is chosen before weekend/all-day hiding, so hiding it does not move the event to a later visible day.

## Styling

Use [card_mod](https://github.com/thomasloven/lovelace-card-mod) for custom CSS. The existing screenshot and examples illustrate the inherited layout. The card currently grows with content; a forced outer height does not provide intentional overflow handling. Opt-in bounded-height behaviour is planned in [#6](https://github.com/davidbmck/week-planner-card/issues/6).

### Day classes and attributes

Rendered day cells have `.day` plus the applicable classes:

| Class | Meaning |
| --- | --- |
| `today`, `tomorrow`, `yesterday` | Relative day. |
| `future`, `past` | Future/past day; tomorrow also has `future`, yesterday also has `past`, today has neither. |
| `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday` | Weekday. |
| `outside-month` | Blank alignment cell in weekday-aligned month view. |
| `header` | A separate weekday header cell, not an event-bearing day. |

Ordinary day cells expose the following attributes. Blank outside-month cells and separate header cells do not carry these data attributes.

| Attribute | Value |
| --- | --- |
| `data-date` | Day of month, 1–31. |
| `data-weekday` | ISO weekday, Monday = 1 through Sunday = 7. |
| `data-month` | Month, 1–12. |
| `data-year` | Calendar year. |
| `data-week` | ISO week number. |

### Event classes and attributes

Entries have `.event` plus the applicable classes:

| Class | Meaning |
| --- | --- |
| `fullday` | All-day entry/segment. |
| `multiday` | Segment of an event spanning multiple days; lowercase spelling. |
| `ongoing` | Start is at/before now and end is after now. |
| `past` | End is before now. |
| `future` | Remaining entries, normally those starting in the future. |

| Attribute | Value |
| --- | --- |
| `data-entity` | First visible calendar/todo entity for the entry. |
| `data-additional-entities` | Comma-separated visible entity list, **including** the primary entity, despite the attribute's name. |
| `data-summary` | Displayed title after filtering/replacement; can include markup such as completed todo strikethrough tags. |
| `data-location` | Location, or an empty string. |
| `data-start-hour`, `data-end-hour` | Segment start/end hour, 0–23, without padding. |
| `data-start-minute`, `data-end-minute` | Segment start/end minute, padded to two digits. |

These times describe the displayed segment, not necessarily the original multi-day event's full span. Completed todos use title markup rather than a separate completion CSS class.

## Examples

Each card example is a complete card configuration. `card_mod` examples require that separate extension.

### Minimal

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
```

### Calendar and todo lists

Only todo items with due dates will appear.

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar
    color: '#e6c229'
  - entity: todo.tasks
    color: '#1a8fe3'
showLegend: true
legendToggle: true
```

### Extended with weather and translated labels

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
    color: '#e6c229'
  - entity: calendar.my_calendar_2
    color: '#1a8fe3'
weather:
  entity: weather.my_weather_service
  showTemperature: true
  showLowTemperature: true
  roundTemperature: true
days: 14
noCardBackground: true
eventBackground: 'rgba(0, 0, 0, .75)'
locationLink: https://www.openstreetmap.org/search?query=
locale: nl
texts:
  noEvents: Geen activiteiten
  fullDay: Hele dag
  today: Vandaag
  tomorrow: Morgen
  yesterday: Gisteren
```

### Fixed seven-column kiosk layout

This fixes the column count, not the height. Bounded-height handling remains planned work.

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.wall_calendar
weather: weather.geelong
days: 21
compact: true
columns:
  extraLarge: 7
  large: 7
  medium: 7
  small: 7
  extraSmall: 7
```

### Starting on Sunday with weekday names

Empty relative-day labels make headings use weekday names instead of Today, Yesterday and Tomorrow. These empty-string overrides can be entered in YAML; the visual editor removes empty text values.

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
startingDay: sunday
texts:
  today: ''
  tomorrow: ''
  yesterday: ''
```

### Replace title text

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
replaceTitleText:
  'Search text': 'Replacement text'
  'Foo': 'Bar'
```

### Past events transparent with card_mod

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
    color: '#e6c229'
card_mod:
  style: |
    .event.past {
      opacity: .3;
    }
```

### Highlight today with card_mod

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
card_mod:
  style: |
    .day.today {
      box-sizing: border-box;
      border: 2px solid #00ffff;
      border-radius: 6px;
      box-shadow: inset 0 0 5px #00ffff;
      margin: 2px;
    }
```

### Custom event style based on title text

Style titles containing the whitespace-separated word `Word1`, or exactly matching `Word2`, with a red background. Use `*=` instead of `~=` for a substring match.

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
    color: '#e6c229'
card_mod:
  style: |
    .event[data-summary~="Word1"],
    .event[data-summary="Word2"] {
      background-color: #ff0000 !important;
    }
```

### Show entire current month

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
days: month
startingDay: month
```

### Show month with each day

The YAML block scalar keeps the Luxon literal-markup quoting readable.

```yaml
type: custom:week-planner-card
calendars:
  - entity: calendar.my_calendar_1
dayFormat: >-
  '<span class="number">'d'</span> <span class="month">'MMMM'</span>'
```

## Credits / lineage

- **Rudy Gnodde / FamousWolf** created the [original Week Planner Card](https://github.com/FamousWolf/week-planner-card).
- **Benjamin Temple / bentemple** added todo support in v1.15.0 and the Home Assistant 2026 event-dialog header compatibility work in v1.15.1 in [bentemple's fork](https://github.com/bentemple/week-planner-card).
- Existing contributors remain represented in git history.

The original attribution is preserved in the [MIT licence](LICENSE).
