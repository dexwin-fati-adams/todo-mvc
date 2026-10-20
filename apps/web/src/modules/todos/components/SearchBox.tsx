type SearchBoxProps = {
  value: string;
  onCommit: (value: string) => void;
  maxLength: number;
};

//This is only a placeholder for now. It renders nothing, so the tests fail because the real search box is missing,
// and not because an import is broken. The next step replaces it.
export function SearchBox(props: SearchBoxProps) {
  void props;
  return null;
}
