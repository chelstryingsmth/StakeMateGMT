import type { Pact } from '../types';
const todo = async (): Promise<never> => { throw new Error('Not implemented: replace mock service with contract integration.'); };
export const getPacts = async ():Promise<Pact[]> => todo(); export const getPactById = async (_id:string):Promise<Pact> => todo();
export const createPact=todo, joinPact=todo, withdrawUnjoined=todo, checkInOnChain=todo, submitProof=todo, reviewProof=todo, finalizePact=todo, withdrawReward=todo;
