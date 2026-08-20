import Header from "@/components/Header";
import ViewContainer from "@/components/ViewContainer";

export default function Home() {
  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden">
      <Header />
      <ViewContainer />
    </div>
  );
}
