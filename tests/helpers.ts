/**
 * Returns the reason a promise rejects with. `expect(promise).rejects` is typed as returning `void`, so it cannot be
 * awaited without upsetting the linter - and if it is not awaited, a failed assertion goes unnoticed.
 */
export async function getRejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}

	throw new Error("Expected the promise to reject, but it resolved.");
}
