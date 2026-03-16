import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const SearchableDropdown = ({
    value,
    onChange,
    options,
    placeholder = "Select...",
    allLabel = "All",
    className = "",
    focusColor = "red-800",
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
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all focus:ring-2 focus:ring-${focusColor} outline-none shadow-sm shadow-black/5`}
            >
                <span className={`truncate ${!value && !showAll ? 'text-gray-400' : 'text-gray-700'}`}>
                    {displayValue}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-[60] mt-2 w-full bg-white border border-gray-100 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {/* Search Input */}
                    <div className="p-3 border-b border-gray-50 bg-gray-50/30">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search..."
                                className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-200 outline-none transition-all"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Options List */}
                    <div ref={listRef} className="max-h-60 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-gray-200 flex flex-col">
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
                                    className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-all mb-1 whitespace-normal ${isFocused ? `bg-${focusColor} text-white shadow-lg scale-[1.02] z-10` :
                                            isSelected ? `bg-${focusColor}/10 text-${focusColor} font-bold border-l-4 border-${focusColor}` :
                                                'text-gray-600 hover:bg-gray-50'
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
