declare module "ed2curve" {
  const ed2curve: {
    convertPublicKey(pk: Uint8Array): Uint8Array | null;
    convertSecretKey(sk: Uint8Array): Uint8Array | null;
  };
  export default ed2curve;
}
