export type SearchBoxProps = {
  value: string | null;
  maxLength: number;
  onCommit: (value: string) => void;
};

//Placeholder. It renders nothing.
export function SearchBox(props: SearchBoxProps) {
  void props;
  return null;
}
