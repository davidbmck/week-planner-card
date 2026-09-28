import { css } from 'lit';

export default css`
    .text-field,
    ha-select,
    ha-formfield,
    ha-expansion-panel,
    ha-button,
    ha-entity-picker,
    ha-icon-picker {
      margin: 8px 0;
    }

    .text-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--primary-text-color);
      font-size: 14px;
    }

    .text-field input {
      box-sizing: border-box;
      width: 100%;
      min-height: 48px;
      padding: 12px 16px;
      border: 1px solid var(--outline-color, var(--divider-color, #888));
      border-radius: 4px;
      background: var(--input-fill-color, transparent);
      color: var(--primary-text-color);
      font: inherit;
    }

    .text-field input:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
`;
