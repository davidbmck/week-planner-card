import { css } from 'lit';

export default css`
    ha-card {
        --header-spacing: 15px;
        --legend-spacing: 15px;
        --legend-dot-size: 10px;
        --navigation-spacing: 5px;
        --navigation-month-font-size: 2em;
        --days-columns: 7;
        --days-spacing: 15px;
        --day-date-number-font-size: 3.5em;
        --day-date-number-line-height: 1.2em;
        --day-date-text-font-size: 1.25em;
        --events-margin-top: 10px;
        --event-spacing: 5px;
        --event-padding: 10px;
        --event-border-width: 5px;
        --event-border-radius: 5px;
        --event-font-size: 1em;
        --event-line-height: 1.2em;
        --event-icon-size: 18px;
        --weather-icon-size: 30px;
        --weather-temperature-separator: ' / ';
        --weather-temperature-font-size: 1em;
    }

    ha-card.nobackground {
        border: none !important;
        background-color: transparent !important;
        box-shadow: none !important;
    }

    ha-card.compact {
        --days-spacing: 5px;
        --day-date-number-font-size: 1.5em;
        --day-date-text-font-size: 1em;
        --events-margin-top: 5px;
        --event-spacing: 2px;
        --event-padding: 2px 5px;
        --event-border-width: 2px;
        --event-font-size: .9em;
        --event-line-height: 1.1em;
        --weather-icon-size: 20px;
        --weather-temperature-font-size: 0.8em;
    }

    /* Bounded mode only: retain the existing unbounded layout and compact YAML. */
    ha-card.bounded {
        box-sizing: border-box;
        overflow: hidden;
    }

    ha-card.bounded .card-content {
        box-sizing: border-box;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    ha-card.bounded .card-title {
        flex: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    ha-card.bounded .errors {
        flex: none;
        max-height: 4em;
        overflow: hidden;
    }

    ha-card.bounded .planner {
        flex: 1;
        min-height: 0;
        align-items: flex-start;
        align-content: flex-start;
        overflow: hidden;
    }

    ha-card.bounded .planner > .day {
        box-sizing: border-box;
        margin-bottom: 0;
        overflow: hidden;
    }

    ha-card.bounded .planner .day:has(.weather) .date {
        min-height: var(--weather-icon-size);
    }

    ha-card.bounded .planner .event .inner,
    ha-card.bounded .planner .event .title span {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    ha-card.bounded .planner .event .additionalColor {
        flex-shrink: 0;
    }

    ha-card.bounded .planner .day[data-density="1"],
    ha-card.bounded .planner .day[data-density="2"],
    ha-card.bounded .planner .day[data-density="3"] {
        --event-padding: 2px 5px;
        --event-spacing: 2px;
    }

    ha-card.bounded .planner .day:is([data-density="2"], [data-density="3"]) .description,
    ha-card.bounded .planner .day:is([data-density="2"], [data-density="3"]) .location,
    ha-card.bounded .planner [data-bounded-hidden],
    .bounded-more[hidden] {
        display: none !important;
    }

    ha-card.bounded .planner .day[data-density="2"] .title span {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
    }

    ha-card.bounded .planner .day[data-density="3"] .title span,
    ha-card.bounded .planner .day:is([data-density="2"], [data-density="3"]) .time,
    ha-card.bounded .planner .day[data-density="2"] .event.fullday .title span {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* The compact all-day treatment is inspired by upstream PR #363. */
    ha-card.bounded .planner .day:is([data-density="2"], [data-density="3"]) .event.fullday .inner {
        display: flex;
        align-items: baseline;
        gap: 6px;
    }

    ha-card.bounded .planner .day:is([data-density="2"], [data-density="3"]) .event.fullday .time {
        flex-shrink: 0;
        max-width: 45%;
        margin-bottom: 0;
    }

    ha-card.bounded .planner .day:is([data-density="2"], [data-density="3"]) .event.fullday .title {
        flex: 1;
        min-width: 0;
    }

    .bounded-more {
        box-sizing: border-box;
        width: 100%;
        border: 0;
        text-align: left;
        color: var(--primary-text-color);
        font-family: inherit;
    }

    button.bounded-more {
        cursor: pointer;
    }

    .height-warning {
        display: none;
    }

    ha-card.height-too-small .card-content > :not(.height-warning) {
        visibility: hidden;
    }

    ha-card.height-too-small .height-warning {
        display: block;
        position: absolute;
        inset: 12px;
        overflow: hidden;
    }

    .container.overflow-list .day {
        width: 100%;
    }
  
    .errors {
        white-space: pre-line;
    }

    .container {
        container-name: weekplanner;
        container-type: inline-size;
        display: flex;
        flex-wrap: wrap;
        gap: var(--days-spacing);
    }
  
    .container.hasActions {
      cursor: pointer;
    }
  
    .container .header {
        width: 100%;
        display: flex;
        flex-wrap: wrap;
        gap: var(--header-spacing);
    }
    
    .container .legend {
        display: flex;
        align-items: center;
    }

    .container .legend ul {
        display: flex;
        flex-wrap: wrap;
        gap: var(--legend-spacing);
        margin: 0;
        padding: 0;
        list-style: none;
    }
    
    .container .legend ul li {
        display: block;
        --mdc-icon-size: 16px;
    }
    
    .container .legend ul li.hasToggle {
        cursor: pointer;
    }

    .container .legend ul li.hidden {
        opacity: .5;
    }

    .container .legend ul li ha-icon {
        color: var(--legend-calendar-color, var(--divider-color, #ffffff));
    }

    .container .legend ul li.hidden ha-icon {
        color: var(--divider-color, #ffffff);
    }

    .container .legend ul li.noIcon:before {
        content: '';
        display: inline-block;
        width: var(--legend-dot-size);
        height: var(--legend-dot-size);
        background-color: var(--legend-calendar-color, var(--divider-color, #ffffff));
        border-radius: 50%;
        margin: 0 5px 0 0;
        vertical-align: middle;
    }

    .container .legend ul li.hidden.noIcon:before {
        background-color: var(--divider-color, #ffffff);
    }

    .container .navigation {
        display: flex;
        gap: var(--navigation-spacing);
        align-items: center;
    }

    .container .navigation .month {
        font-size: var(--navigation-month-font-size);
    }

    .container .navigation ul {
        display: flex;
        flex-wrap: wrap;
        gap: var(--navigation-spacing);
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .container .navigation ul li {
        display: block;
        cursor: pointer;
    }

    .container .day {
        position: relative;
        width: calc((100% - (var(--days-columns) - 1) * var(--days-spacing)) / var(--days-columns));
        margin: 0 0 var(--days-spacing) 0;
    }

    .container .day .date {
        position: relative;
        z-index: 1;
    }

    .container .day .date .number {
        font-size: var(--day-date-number-font-size);
        line-height: var(--day-date-number-line-height);
    }

    .container .day .date .text {
        font-size: var(--day-date-text-font-size);
    }

    .container .day .weather {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 2;
        font-size: var(--weather-temperature-font-size);
        cursor: pointer;
    }

    .container .day .weather .icon {
        display: inline-block;
        vertical-align: middle;
        background-size: cover;
        width: var(--weather-icon-size);
        height: var(--weather-icon-size);
    }

    .container .day .weather .icon img {
        max-width: var(--weather-icon-size);
        max-height: var(--weather-icon-size);
    }

    .container .day .weather div.temperature {
        display: inline-block;
        margin: 0 5px 0 0;
        vertical-align: middle;
    }

    .container .day .weather .temperature:has(.high) .low:before {
        content: var(--weather-temperature-separator);
    }

    .container .day .events {
        margin-top: var(--events-margin-top);
    }

    .container .day .events .none,
    .container .day .events .more,
    .container .day .events .event {
        margin-bottom: var(--event-spacing);
        background-color: var(--event-background-color);
        border-radius: 0 var(--event-border-radius) var(--event-border-radius) 0;
        font-size: var(--event-font-size);
        line-height: var(--event-line-height);
    }

    .container .day .events .none,
    .container .day .events .more {
        padding: var(--event-padding);
        border-radius: var(--event-border-radius);
    }

    .container .day .events .event {
        display: flex;
        border-left: var(--event-border-width) solid var(--border-color, var(--divider-color, #ffffff));
        cursor: pointer;
    }

    .container .day .events .event .additionalColor {
        width: var(--event-border-width);
        background-color: var(--event-additional-color);
    }

    .container .day .events .event .icon {
        padding: var(--event-padding);
    }

    .container .day .events .event .inner {
        flex-grow: 1;
        padding: var(--event-padding);
    }

    .container .day .events .event .time {
        color: var(--secondary-text-color, #aaaaaa);
        margin: 0 0 3px 0;
    }

    .container .day .events .event .location {
        margin: 3px 0 0 0;
        --mdc-icon-size: var(--event-icon-size);
    }

    .loader {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 40px;
        height: 40px;
    }

    .loader:after {
        content: " ";
        display: block;
        width: 24px;
        height: 24px;
        margin: 4px;
        border-radius: 50%;
        border: 3px solid var(--primary-text-color);
        border-color: var(--primary-text-color) transparent var(--primary-text-color) transparent;
        animation: loader 1.2s linear infinite;
    }

    ha-dialog .calendar,
    ha-dialog .datetime,
    ha-dialog .location {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
    }

    ha-dialog .calendar ha-icon,
    ha-dialog .datetime ha-icon,
    ha-dialog .location ha-icon {
        margin-right: 8px;
    }

    ha-dialog .location .info a {
        color: var(--primary-text-color);
    }

    ha-dialog .description {
        border-top: 1px solid var(--primary-text-color);
        margin-top: 16px;
        padding-top: 16px;
    }

    @keyframes loader {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    @container weekplanner (width <= 1920px) {
        ha-card .container .day {
            --days-columns: var(--days-columns-lg, 7);
        }
        ha-card.compact .container .day {
            --days-columns: var(--days-columns-lg, 7);
        }
    }
    
    @container weekplanner (width <= 1280px) {
        ha-card .container .day {
            --days-columns: var(--days-columns-md, 5);
        }
        ha-card.compact .container .day {
            --days-columns: var(--days-columns-md, 7);
        }
    }

    @container weekplanner (width <= 1024px) {
        ha-card .container .header .legend,
        ha-card .container .header .navigation {
            width: 100%;
        }
        ha-card .container .day {
            --days-columns: var(--days-columns-sm, 3);
        }
        ha-card.compact .container .day {
            --days-columns: var(--days-columns-sm, 4);
        }
    }
  
    @container weekplanner (width <= 640px) {
        ha-card .container .day {
            --days-columns: var(--days-columns-xs, 1);
        }
        ha-card.compact .container .day {
            --days-columns: var(--days-columns-xs, 2);
        }
    }
`;
