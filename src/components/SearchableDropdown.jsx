import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const SearchableDropdown = ({
    value,
    onChange,
    options,
    placeholder = "Select...",
    allLabel = "All",
    className = "",
    focusColor = "primary",
    showAll = true
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when dropdown opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setFocusedIndex(-1);
        }
    }, [isOpen]);

    // Reset focus index when search term changes
    useEffect(() => {
        setFocusedIndex(-1);
    }, [searchTerm]);

    const filteredOptions = options.filter(opt =>
        String(opt).toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Combine "All" and filtered options into one list for indexing
    const allItems = showAll ? ['', ...filteredOptions] : filteredOptions;

    const handleSelect = (opt) => {
        onChange(opt);
        setIsOpen(false);
        setSearchTerm('');
        setFocusedIndex(-1);
    };

    const handleKeyDown = (e) => {
        if (!isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex(prev => (prev < allItems.length - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
                break;
            case 'Enter':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < allItems.length) {
                    handleSelect(allItems[focusedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    // Scroll focused item into view
    useEffect(() => {
        if (focusedIndex >= 0 && listRef.current) {
            const focusedElement = listRef.current.children[focusedIndex];
            if (focusedElement) {
                focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [focusedIndex]);

    const displayValue = value || (showAll ? allLabel : placeholder);

    return (
        <div ref={dropdownRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded text-sm font-medium text-gray-700 hover:border-gray-300 transition-all focus:ring-2 focus:ring-${focusColor === 'primary' ? 'primary' : focusColor} outline-none shadow-sm shadow-black/5`}
            >
                <span className={`truncate ${!value && !showAll ? 'text-gray-400' : 'text-gray-700'}`}>
                    {displayValue}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-[100] mt-3 w-full bg-white/95 backdrop-blur-xl border border-white/40 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 ease-out origin-top">
                    {/* Search Input */}
                    <div className="p-4 border-b border-gray-50 bg-gray-50/20">
                        <div className="relative group">
                            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Quick search..."
                                className="w-full pl-10 pr-10 py-3 text-sm bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-medium"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all font-black"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Options List */}
                    <div ref={listRef} className="max-h-72 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar">
                        {allItems.map((opt, idx) => {
                            const isAllOption = showAll && idx === 0 && opt === '';
                            const label = isAllOption ? allLabel : opt;
                            const isSelected = value === opt;
                            const isFocused = focusedIndex === idx;

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSelect(opt)}
                                    className={`w-full text-left px-4 py-3.5 text-sm rounded-xl transition-all whitespace-normal ${isFocused ? `bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02] z-10` :
                                        isSelected ? `bg-primary/10 text-primary font-black border-l-4 border-primary` :
                                            'text-gray-600 hover:bg-gray-50 hover:pl-5'
                                        }`}
                                >
                                    {label}
                                </button>
                            );
                        })}

                        {allItems.length === 0 && (
                            <div className="px-4 py-8 text-center">
                                <Search size={24} className="mx-auto text-gray-200 mb-2" />
                                <p className="text-xs text-gray-400 font-medium">No results found</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown;
