export interface Agent<Input, Output> {
  execute(input: Input): Promise<Output>;
}
