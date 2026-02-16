import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, MapPin, Loader2, AlertCircle } from "lucide-react";
import { searchByGushHelka, searchByAddress, type GeoResult } from "@/lib/geocode";

interface SearchPanelProps {
  onResult: (result: GeoResult) => void;
}

export function SearchPanel({ onResult }: SearchPanelProps) {
  const [gush, setGush] = useState("");
  const [helka, setHelka] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGushHelkaSearch = async () => {
    if (!gush || !helka) {
      setError("יש להזין מספר גוש ומספר חלקה");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await searchByGushHelka(Number(gush), Number(helka));
      onResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSearch = async () => {
    if (!address.trim()) {
      setError("יש להזין כתובת");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await searchByAddress(address);
      onResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-card border-b p-4" dir="rtl">
      <Tabs defaultValue="gush" className="w-full max-w-2xl mx-auto">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="gush" className="gap-2">
            <MapPin className="h-4 w-4" />
            גוש / חלקה
          </TabsTrigger>
          <TabsTrigger value="address" className="gap-2">
            <Search className="h-4 w-4" />
            כתובת
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gush">
          <div className="flex flex-col sm:flex-row gap-3 items-end mt-3">
            <div className="flex-1 w-full">
              <Label htmlFor="gush-input">מספר גוש</Label>
              <Input
                id="gush-input"
                type="number"
                placeholder="לדוגמה: 6158"
                value={gush}
                onChange={(e) => setGush(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGushHelkaSearch()}
                dir="ltr"
              />
            </div>
            <div className="flex-1 w-full">
              <Label htmlFor="helka-input">מספר חלקה</Label>
              <Input
                id="helka-input"
                type="number"
                placeholder="לדוגמה: 25"
                value={helka}
                onChange={(e) => setHelka(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGushHelkaSearch()}
                dir="ltr"
              />
            </div>
            <Button onClick={handleGushHelkaSearch} disabled={loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              חיפוש
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="address">
          <div className="flex flex-col sm:flex-row gap-3 items-end mt-3">
            <div className="flex-1 w-full">
              <Label htmlFor="address-input">כתובת</Label>
              <Input
                id="address-input"
                placeholder="לדוגמה: רוטשילד 1, תל אביב"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
              />
            </div>
            <Button onClick={handleAddressSearch} disabled={loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              חיפוש
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {error && (
        <Alert variant="destructive" className="mt-3 max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
