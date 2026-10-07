/**
 * Text as public list searches compare it: lower case, without accents and
 * with the dotless i as "i", so "arac" finds "Araç" and "yaris" finds "Yarış".
 * (The same rule as the admin panel's search.)
 */
export function foldSearchText(value: string) {
    return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
}
