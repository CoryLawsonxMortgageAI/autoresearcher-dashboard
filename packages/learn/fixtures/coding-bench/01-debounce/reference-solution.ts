export const solve = <A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
): ((...args: A) => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};
