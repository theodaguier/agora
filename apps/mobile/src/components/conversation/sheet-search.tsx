import { SearchField, useBottomSheetAwareHandlers } from "heroui-native";

/** The search field of a sheet: it lifts the sheet above the keyboard. `secondary`: the field fill would match the sheet's own. */
export function SheetSearch({ value, onChange, placeholder, autoFocus, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onSubmit?: () => void }) {
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  return (
    <SearchField value={value} onChange={onChange}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input
          variant="secondary"
          placeholder={placeholder}
          accessibilityLabel={placeholder}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          onFocus={onFocus}
          onBlur={onBlur} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}
