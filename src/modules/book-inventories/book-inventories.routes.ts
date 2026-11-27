import {
    getFeaturedBooks,
    getBooks,
    getBookById,
    createBook,
    updateBook,
    deleteBook,

    addCopyToBook,
    updateCopy, 
    deleteCopy,

    requireStaffAndStudent,
    requireStaff

} from './book-inventories.controller.js';
import { Router } from 'express';


const bookRouter = Router();

const physicalCopiesRouter = Router();

bookRouter.get('/featured', getFeaturedBooks);
bookRouter.get('/', requireStaffAndStudent, getBooks);
bookRouter.get('/:id', requireStaffAndStudent, getBookById);
bookRouter.post('/', requireStaff, createBook);
bookRouter.put('/:id', requireStaff, updateBook);
bookRouter.delete('/:id', requireStaff, deleteBook);

bookRouter.post('/:bookId/copies', requireStaff, addCopyToBook);

physicalCopiesRouter.put('/:id', requireStaff, updateCopy);
physicalCopiesRouter.delete('/:id', requireStaff, deleteCopy);

export { bookRouter, physicalCopiesRouter };
