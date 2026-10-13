/**
 * Free list of reusable objects. Characters are expensive enough (a dozen
 * meshes each) that customers walking in and out all day must not allocate,
 * so released objects wait here until the next acquire.
 */
export class Pool<T> {
  private readonly free: T[] = [];
  private readonly live = new Set<T>();
  /** Objects ever made by the factory. */
  created = 0;

  constructor(
    private readonly create: () => T,
    private readonly onRelease: (item: T) => void = () => {},
  ) {}

  acquire(): T {
    const item = this.free.pop() ?? this.make();
    this.live.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.live.delete(item)) return;
    this.onRelease(item);
    this.free.push(item);
  }

  get liveCount(): number {
    return this.live.size;
  }

  get freeCount(): number {
    return this.free.length;
  }

  /** Every object made so far, live or free. */
  all(): T[] {
    return [...this.live, ...this.free];
  }

  private make(): T {
    this.created += 1;
    return this.create();
  }
}
