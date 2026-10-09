/** An option of a select, combo box, or media picker. */
export interface Option {
	id: string;
	label: string;
	/** For media options. */
	thumbnailUrl?: string;
	contentType?: string;
}
