/** Complete an invite/recovery only for a pre-provisioned active staff member.
 * Transport is injected for testing without any remote Auth calls.
 * @param {{token_hash:string,type:'invite'|'recovery',password:string}} input
 * @param {{auth:(path:string,body:unknown)=>Promise<any>,member:(token:string)=>Promise<any>,user:(path:string,body:unknown,token:string,method?:string)=>Promise<any>}} transport
 */
export async function completeStaffPassword(input, transport) {
  const session = await transport.auth('/auth/v1/verify', {
    token_hash: input.token_hash, type: input.type,
  });
  if (!session?.access_token || !session?.refresh_token || !Number.isInteger(session.expires_in) || session.expires_in <= 0) {
    throw Error('Invalid authentication session');
  }
  try {
    await transport.member(session.access_token);
    await transport.user('/auth/v1/user', {password:input.password}, session.access_token, 'PUT');
    return session;
  } catch (error) {
    await transport.user('/auth/v1/logout?scope=local', {}, session.access_token).catch(() => null);
    throw error;
  }
}
